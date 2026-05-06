/**
 * Cache-manager tests — focus on the (model, role, hash, tools) cache key
 * and the contract that tools are forwarded into the cached content.
 *
 * Why this exists (real-soak finding 2026-05-06): the route was passing
 * `tools` alongside `cachedContent` on every GenerateContent request,
 * which Gemini rejects with:
 *   "CachedContent can not be used with GenerateContent request setting
 *    system_instruction, tools or tool_config. Proposed fix: move those
 *    values to CachedContent from GenerateContent request."
 *
 * Fix: bake `tools` into the cache at create time. These tests pin that
 * contract so a future refactor can't silently regress it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createCacheMock = vi.fn<(opts: unknown) => Promise<{ name: string }>>();
const deleteCacheMock = vi.fn<(name: string) => Promise<void>>();

vi.mock("./gemini-client", () => ({
  createCache: (opts: unknown) => createCacheMock(opts),
  deleteCache: (name: string) => deleteCacheMock(name),
}));

import {
  getOrCreateCachedContent,
  evictCacheEntry,
  isStaleCacheError,
  __resetCacheMap,
} from "./gemini-cache-manager";
import type { GeminiTool } from "./gemini-client";

const MODEL = "gemini-3-flash-preview" as const;
const ROLE = "parent";
const HASH = "abc123def456";

const TOOL_A: GeminiTool = {
  functionDeclarations: [
    { name: "read_recent_feed", description: "", parameters: {} },
  ],
};

const TOOL_B: GeminiTool = {
  functionDeclarations: [{ name: "log_food", description: "", parameters: {} }],
};

beforeEach(() => {
  __resetCacheMap();
  createCacheMock.mockReset();
  deleteCacheMock.mockReset();
  createCacheMock.mockResolvedValue({ name: "caches/test-1" });
  // mockReset() wipes the implementation too — restore the resolved-Promise
  // default each turn so the manager's `.catch(...)` chain works.
  deleteCacheMock.mockResolvedValue(undefined);
});

afterEach(() => {
  __resetCacheMap();
});

function call(
  opts: {
    versionHash?: string;
    tools?: GeminiTool[];
    staticSystemInstruction?: string;
  } = {},
) {
  return getOrCreateCachedContent({
    model: MODEL,
    effectiveRole: ROLE,
    versionHash: opts.versionHash ?? HASH,
    staticSystemInstruction: opts.staticSystemInstruction ?? "system prompt",
    tools: opts.tools ?? [TOOL_A],
  });
}

describe("getOrCreateCachedContent — tools baked into the cache", () => {
  it("forwards tools to createCache so they live alongside the cached system instruction", async () => {
    await call({ tools: [TOOL_A] });

    expect(createCacheMock).toHaveBeenCalledTimes(1);
    const passed = createCacheMock.mock.calls[0][0] as {
      tools?: GeminiTool[];
    };
    expect(passed.tools).toEqual([TOOL_A]);
  });

  it("returns the SDK cache name", async () => {
    createCacheMock.mockResolvedValueOnce({ name: "caches/abc" });
    expect(await call()).toBe("caches/abc");
  });

  it("reuses the cache on identical (model, role, hash, tools) tuple — no re-create", async () => {
    await call();
    await call();
    expect(createCacheMock).toHaveBeenCalledTimes(1);
  });

  it("creates a NEW cache when the tool set changes (tools are part of the cache identity)", async () => {
    createCacheMock.mockResolvedValueOnce({ name: "caches/with-A" });
    createCacheMock.mockResolvedValueOnce({ name: "caches/with-B" });

    expect(await call({ tools: [TOOL_A] })).toBe("caches/with-A");
    expect(await call({ tools: [TOOL_B] })).toBe("caches/with-B");
    expect(createCacheMock).toHaveBeenCalledTimes(2);
  });

  it("evicts the previous (model, role) entry when prompt-version hash changes", async () => {
    createCacheMock.mockResolvedValueOnce({ name: "caches/v1" });
    createCacheMock.mockResolvedValueOnce({ name: "caches/v2" });

    await call({ versionHash: "hash-v1" });
    await call({ versionHash: "hash-v2" });

    expect(createCacheMock).toHaveBeenCalledTimes(2);
    // Best-effort delete of the old SDK-side cache.
    expect(deleteCacheMock).toHaveBeenCalledWith("caches/v1");
  });

  it("fails open (returns null) when createCache throws — caller proceeds uncached", async () => {
    createCacheMock.mockRejectedValueOnce(new Error("cache too small"));
    expect(await call()).toBeNull();
  });

  it("evictCacheEntry removes the entry for the matching (model, role, hash, tools) tuple", async () => {
    await call({ tools: [TOOL_A] });
    expect(createCacheMock).toHaveBeenCalledTimes(1);

    evictCacheEntry({
      model: MODEL,
      effectiveRole: ROLE,
      versionHash: HASH,
      tools: [TOOL_A],
    });

    // After eviction, the next call must re-create.
    await call({ tools: [TOOL_A] });
    expect(createCacheMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent callers for the same key onto a single createCache RPC", async () => {
    // Hold the createCache resolver hostage until both calls have started.
    let resolveCreate!: (value: { name: string }) => void;
    createCacheMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const p1 = call();
    const p2 = call();
    // Both calls should now be waiting on the same in-flight promise.
    resolveCreate({ name: "caches/coalesced" });

    expect(await p1).toBe("caches/coalesced");
    expect(await p2).toBe("caches/coalesced");
    expect(createCacheMock).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight slot after rejection so the next caller can retry", async () => {
    createCacheMock.mockRejectedValueOnce(new Error("transient"));
    expect(await call()).toBeNull();

    // Subsequent call should NOT see a stuck in-flight promise.
    createCacheMock.mockResolvedValueOnce({ name: "caches/retry-ok" });
    expect(await call()).toBe("caches/retry-ok");
    expect(createCacheMock).toHaveBeenCalledTimes(2);
  });

  it("hashes tools with deterministic key ordering (parameters key insertion order is irrelevant)", async () => {
    createCacheMock.mockResolvedValueOnce({ name: "caches/order-1" });
    createCacheMock.mockResolvedValueOnce({ name: "caches/order-2" });

    const orderedAB: GeminiTool = {
      functionDeclarations: [
        {
          name: "log",
          description: "",
          parameters: { type: "object", properties: { a: {}, b: {} } },
        },
      ],
    };
    const orderedBA: GeminiTool = {
      functionDeclarations: [
        {
          name: "log",
          description: "",
          parameters: { type: "object", properties: { b: {}, a: {} } },
        },
      ],
    };

    await call({ tools: [orderedAB] });
    await call({ tools: [orderedBA] });
    // Same logical tool set ⇒ same cache, only one createCache call.
    expect(createCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe("isStaleCacheError carve-outs", () => {
  it("returns true for the typical stale-cache error message", () => {
    expect(
      isStaleCacheError(new Error("CachedContent caches/abc was not found")),
    ).toBe(true);
  });

  it("returns false for quota errors that mention cache", () => {
    expect(
      isStaleCacheError(
        new Error("Cache quota exceeded — not found in free tier"),
      ),
    ).toBe(false);
  });

  it("returns false for rate-limit errors that mention cache", () => {
    expect(
      isStaleCacheError(new Error("Cache rate limit reached, expired window")),
    ).toBe(false);
  });

  it("returns false for non-Error inputs", () => {
    expect(isStaleCacheError("string error")).toBe(false);
    expect(isStaleCacheError(null)).toBe(false);
  });
});
