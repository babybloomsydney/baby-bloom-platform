/**
 * Tests for `useChatStream`'s preload passthrough behaviour.
 *
 * Per `Latency:Efficiency/07-test-plan.md §WU7`:
 *
 * 8.  send() includes `preload` in the request body when provided.
 * 9.  send() omits `preload` from the body when KATIE_PRELOAD_PASSTHROUGH_ENABLED
 *     is false.
 * 10. send() works without preload (legacy callers).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { PreloadedContext } from "@/lib/chat/preload/types";
import type { CurrentSurface } from "@/contexts/KatieContext";

const FAKE_SURFACE: CurrentSurface = {
  route: "/nanny/development/c1",
  feature: "child-development",
};

const mockFlag = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/chat/flags", () => ({
  get KATIE_PRELOAD_PASSTHROUGH_ENABLED() {
    return mockFlag.value;
  },
  KATIE_STREAM_DIAGNOSTICS: false,
}));

import { useChatStream } from "./use-chat-stream";

const NOOP_APPEND = () => {};

function makeFakeReader(events: string[] = ['data: {"type":"done"}']) {
  let i = 0;
  return {
    read: async () => {
      if (i >= events.length) return { value: undefined, done: true };
      const value = new TextEncoder().encode(events[i++] + "\n\n");
      return { value, done: false };
    },
  };
}

function fakeFetchOK(): Response {
  return {
    ok: true,
    status: 200,
    body: { getReader: () => makeFakeReader() },
  } as unknown as Response;
}

beforeEach(() => {
  // Load-bearing: vi.restoreAllMocks() restores spies but NOT the
  // mockFlag value, since it's a plain object reset by hand. If you
  // remove this line, the "flag off" test will leak into siblings.
  mockFlag.value = true;
  vi.restoreAllMocks();
});

describe("useChatStream — preload passthrough", () => {
  it("includes `preload` in the request body when provided + flag on", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeFetchOK());
    const { result } = renderHook(() => useChatStream());

    const preload: PreloadedContext = {
      as_of: "2026-05-09T01:00:00Z",
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    };

    await act(async () => {
      await result.current.send("hi", FAKE_SURFACE, NOOP_APPEND, preload);
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.preload).toBeDefined();
    expect(body.preload.my_profile_basics.first_name).toBe("Emma");
  });

  it("omits `preload` from the body when KATIE_PRELOAD_PASSTHROUGH_ENABLED is false", async () => {
    mockFlag.value = false;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeFetchOK());
    const { result } = renderHook(() => useChatStream());

    const preload: PreloadedContext = {
      as_of: "2026-05-09T01:00:00Z",
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    };

    await act(async () => {
      await result.current.send("hi", FAKE_SURFACE, NOOP_APPEND, preload);
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.preload).toBeUndefined();
  });

  it("works without preload (legacy callers — no body.preload field)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeFetchOK());
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi", FAKE_SURFACE, NOOP_APPEND);
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.preload).toBeUndefined();
    expect(body.message).toBe("hi");
  });

  it("does NOT include `preload` when the preload has no as_of (publisher hasn't fired yet)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeFetchOK());
    const { result } = renderHook(() => useChatStream());

    // Empty preload — provider mounted, no setPreloadSlots called yet.
    await act(async () => {
      await result.current.send("hi", FAKE_SURFACE, NOOP_APPEND, {});
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.preload).toBeUndefined();
  });

  it("does NOT include `preload` when caller passes undefined explicitly", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeFetchOK());
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send("hi", FAKE_SURFACE, NOOP_APPEND, undefined);
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.preload).toBeUndefined();
  });
});
