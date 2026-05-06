/**
 * Gemini cachedContent manager (WU 13.2).
 *
 * Caches the STATIC portion of Katie's prompt (sections + module
 * fragments) so subsequent turns within the cache TTL pay ~$0.05/1M
 * input tokens for that portion instead of ~$0.50/1M — a 10× reduction.
 *
 * Design principles:
 *   - Per-worker in-process Map keyed by (model, effectiveRole, hash).
 *     Avoids hitting `caches.create` on every request.
 *   - Cache key includes effectiveRole because role_X sections are
 *     dimension-three: a flash-nanny cache shouldn't be reused for a
 *     flash-parent turn.
 *   - Hash bumps (any prompt section change → trg_katie_prompt_bump_version
 *     trigger) auto-invalidate stale cache entries. The manager evicts
 *     the previous (model, role, oldHash) entry and creates a new one
 *     under the new hash.
 *   - TTL = 1 hour. Natural expiry > paying for refresh. After TTL,
 *     the next request misses, re-creates, no user-facing impact.
 *   - Fail-open everywhere. If cache create fails, the route proceeds
 *     uncached for that turn and tries again next turn.
 *   - Stale cache (TTL expired between create and use) → caller catches
 *     the Gemini error, calls evictCacheEntry, re-issues uncached.
 *
 * What this manager does NOT do:
 *   - It does not cache per-user content (snapshot, memory, history).
 *   - It does not write to Supabase. All state is worker-local.
 *   - It does not cost-track. cost-tracker.ts already accrues
 *     cachedContentTokenCount from Gemini's usageMetadata.
 */

import { createHash } from "node:crypto";
import { createCache, deleteCache, type GeminiTool } from "./gemini-client";
import type { GeminiModelId } from "./model-selector";

interface CacheEntry {
  cacheName: string;
  /** Composite of (promptVersionHash, toolsHash). Stored so eviction can
   *  detect any change to either dimension. */
  hash: string;
  createdAt: number;
}

/** Worker-local Map, keyed by `${model}::${role}::${hash}`. */
const cacheMap = new Map<string, CacheEntry>();

/** Tracks an in-flight createCache promise per cache key so concurrent
 *  callers for the same (model, role, hash) coalesce onto a single
 *  Gemini caches.create RPC instead of racing each other. Cleared when
 *  the promise resolves OR rejects. */
const inFlightCreates = new Map<string, Promise<string | null>>();

/** Default TTL (seconds) for cache entries — Gemini's 1hr default. */
const DEFAULT_TTL_SECONDS = 3600;

/** Deterministic JSON serialiser — sorts object keys recursively so two
 *  semantically identical objects always serialise to the same string,
 *  regardless of property insertion order. JSON.stringify alone is
 *  insertion-order dependent, which would cause spurious cache misses
 *  if a tool's `parameters` were rebuilt with a different key order
 *  (e.g. across server restarts or refactors). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

/** Stable hash of a tools array. Cache identity must include tools because
 *  Gemini bakes them into the cache at create time — a tool-set change
 *  must produce a fresh cache, otherwise the model would call functions
 *  the route can no longer dispatch. */
function hashTools(tools: GeminiTool[]): string {
  if (tools.length === 0) return "no-tools";
  const declarations = tools
    .flatMap((t) => t.functionDeclarations)
    .map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return createHash("sha256")
    .update(stableStringify(declarations))
    .digest("hex")
    .slice(0, 16);
}

/** Combine the prompt-version hash with the tools hash into a single
 *  identity string used in the cache map key and the CacheEntry. */
function compositeHash(versionHash: string, tools: GeminiTool[]): string {
  return `${versionHash}::${hashTools(tools)}`;
}

/** Build the composite cache map key. */
function makeKey(model: string, role: string, hash: string): string {
  return `${model}::${role}::${hash}`;
}

/** Test-only: clear the in-process cache map. */
export function __resetCacheMap(): void {
  cacheMap.clear();
  inFlightCreates.clear();
}

/**
 * Returns a Gemini cache name for the (model, role, hash) tuple, creating
 * one if needed. Fail-open: returns `null` on any error so the caller
 * proceeds with the uncached path.
 *
 * On hash mismatch (prompt was edited since the last cache was created
 * for this model+role), the previous entry is evicted and a new one is
 * created. The previous Gemini cache is deleted best-effort — we don't
 * block on the delete since TTL would reap it anyway.
 */
/** Args for getOrCreateCachedContent / evictCacheEntry. Options-object
 *  form chosen so two indistinguishable string params (versionHash and
 *  staticSystemInstruction) can't be silently swapped at the call site. */
export interface CachedContentRequest {
  model: GeminiModelId;
  effectiveRole: string;
  versionHash: string;
  staticSystemInstruction: string;
  tools: GeminiTool[];
}

export type CachedContentEvictRequest = Pick<
  CachedContentRequest,
  "model" | "effectiveRole" | "versionHash" | "tools"
>;

export async function getOrCreateCachedContent(
  req: CachedContentRequest,
): Promise<string | null> {
  const { model, effectiveRole, versionHash, staticSystemInstruction, tools } =
    req;
  const hash = compositeHash(versionHash, tools);
  const key = makeKey(model, effectiveRole, hash);

  // Fast path — same model/role/hash/tools already cached on this worker.
  const existing = cacheMap.get(key);
  if (existing) return existing.cacheName;

  // Concurrent-call coalescing — if another caller for the same key is
  // already mid-flight on createCache, wait on its promise instead of
  // starting a second RPC. Bounds quota use on cold-start bursts.
  const inFlight = inFlightCreates.get(key);
  if (inFlight) return inFlight;

  // Hash-mismatch path — evict any prior entry for this (model, role)
  // with a different composite hash. Anything older is stale.
  for (const [k, entry] of cacheMap.entries()) {
    if (k.startsWith(`${model}::${effectiveRole}::`) && entry.hash !== hash) {
      cacheMap.delete(k);
      // Best-effort delete — non-fatal. TTL would reap it anyway. We log
      // failures at warn so genuine infra errors don't disappear silently.
      void deleteCache(entry.cacheName).catch((e: unknown) =>
        console.warn(
          "[gemini-cache] best-effort delete failed:",
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
  }

  // Slow path — create a new cache entry. Tools are baked in here so the
  // GenerateContent call can omit them (Gemini rejects requests that set
  // both `cachedContent` and `tools`).
  const flight = (async (): Promise<string | null> => {
    try {
      const cache = await createCache({
        model,
        systemInstruction: staticSystemInstruction,
        tools: tools.length > 0 ? tools : undefined,
        // displayName uses both halves of the composite hash so an
        // operator scanning Gemini's cache console can distinguish a
        // prompt-version bump from a tool-set change.
        displayName: `katie::${effectiveRole}::${hash}`,
        ttlSeconds: DEFAULT_TTL_SECONDS,
      });
      const cacheName = cache.name;
      if (typeof cacheName !== "string" || cacheName.length === 0) {
        // SDK should always return a name on success; if not, treat as failure.
        console.warn(
          "[gemini-cache] createCache returned no name (failing open)",
        );
        return null;
      }
      cacheMap.set(key, {
        cacheName,
        hash,
        createdAt: Date.now(),
      });
      return cacheName;
    } catch (err) {
      // Fail-open: the most common cause is the static prompt being below
      // Gemini's minimum-cacheable-token threshold. Logging warn so we can
      // see the rate without alarming. Caller proceeds uncached.
      console.warn("[gemini-cache] createCache failed (failing open):", {
        model,
        effectiveRole,
        hash,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      inFlightCreates.delete(key);
    }
  })();

  inFlightCreates.set(key, flight);
  return flight;
}

/**
 * Removes a cache entry from the worker-local map. Used by the route's
 * stale-cache recovery path: if a generateStream call fails because the
 * cache name is no longer valid (TTL expired between create and use),
 * the route evicts and retries uncached.
 *
 * Does NOT delete the Gemini-side cache — that's already gone or expired.
 */
export function evictCacheEntry(req: CachedContentEvictRequest): void {
  const { model, effectiveRole, versionHash, tools } = req;
  cacheMap.delete(
    makeKey(model, effectiveRole, compositeHash(versionHash, tools)),
  );
}

/**
 * Heuristic for "is this Gemini error caused by a stale cache name?".
 *
 * Gemini doesn't expose a stable error code for this case; we recognise
 * it by the presence of "cachedContent" or "cache" plus "not found" /
 * "expired" in the error message.
 *
 * Carve-outs: any error mentioning quota / rate / limit is NOT stale-
 * cache. Without this guard a quota error containing the words "cache"
 * and "not found" (e.g. "cache quota not found in this region") would
 * be misclassified, silently swallowing the actual rate-limit failure
 * that the route operator needs to see.
 */
export function isStaleCacheError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Exclude obvious non-stale-cache failure modes that may co-mention
  // cache-related words. Stale-cache must be the dominant signal.
  if (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("ratelimit")
  ) {
    return false;
  }
  const mentionsCache = msg.includes("cachedcontent") || msg.includes("cache");
  const mentionsExpiry =
    msg.includes("not found") ||
    msg.includes("expired") ||
    msg.includes("does not exist");
  return mentionsCache && mentionsExpiry;
}
