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

import { createCache, deleteCache } from "./gemini-client";
import type { GeminiModelId } from "./model-selector";

interface CacheEntry {
  cacheName: string;
  hash: string;
  createdAt: number;
}

/** Worker-local Map, keyed by `${model}::${role}::${hash}`. */
const cacheMap = new Map<string, CacheEntry>();

/** Default TTL (seconds) for cache entries — Gemini's 1hr default. */
const DEFAULT_TTL_SECONDS = 3600;

/** Build the composite cache map key. */
function makeKey(model: string, role: string, hash: string): string {
  return `${model}::${role}::${hash}`;
}

/** Test-only: clear the in-process cache map. */
export function __resetCacheMap(): void {
  cacheMap.clear();
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
export async function getOrCreateCachedContent(
  model: GeminiModelId,
  effectiveRole: string,
  hash: string,
  staticSystemInstruction: string,
): Promise<string | null> {
  const key = makeKey(model, effectiveRole, hash);

  // Fast path — same model/role/hash already cached on this worker.
  const existing = cacheMap.get(key);
  if (existing) return existing.cacheName;

  // Hash-mismatch path — evict any prior entry for this model/role with
  // a different hash. (Only one entry per (model, role) is meaningful;
  // anything older is stale.)
  for (const [k, entry] of cacheMap.entries()) {
    if (k.startsWith(`${model}::${effectiveRole}::`) && entry.hash !== hash) {
      cacheMap.delete(k);
      // Best-effort delete — non-fatal. TTL would reap it anyway.
      void deleteCache(entry.cacheName).catch(() => undefined);
    }
  }

  // Slow path — create a new cache entry.
  try {
    const cache = await createCache({
      model,
      systemInstruction: staticSystemInstruction,
      displayName: `katie::${effectiveRole}::${hash.slice(0, 8)}`,
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
      hash: hash.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Removes a cache entry from the worker-local map. Used by the route's
 * stale-cache recovery path: if a generateStream call fails because the
 * cache name is no longer valid (TTL expired between create and use),
 * the route evicts and retries uncached.
 *
 * Does NOT delete the Gemini-side cache — that's already gone or expired.
 */
export function evictCacheEntry(
  model: GeminiModelId,
  effectiveRole: string,
  hash: string,
): void {
  cacheMap.delete(makeKey(model, effectiveRole, hash));
}

/**
 * Heuristic for "is this Gemini error caused by a stale cache name?".
 *
 * Gemini doesn't expose a stable error code for this case; we recognise
 * it by the presence of "cachedContent" or "cache" plus "not found" /
 * "expired" in the error message. False positives are bounded — a
 * regular error that mentions cache wouldn't usually have "not found"
 * adjacent.
 */
export function isStaleCacheError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const mentionsCache = msg.includes("cachedcontent") || msg.includes("cache");
  const mentionsExpiry =
    msg.includes("not found") ||
    msg.includes("expired") ||
    msg.includes("does not exist");
  return mentionsCache && mentionsExpiry;
}
