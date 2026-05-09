/**
 * Tests for PreloadContext provider.
 *
 * Per `Latency:Efficiency/07-test-plan.md §WU7`:
 *
 * 1. usePreload() outside provider throws.
 * 2. usePreloadOptional() outside provider returns null.
 * 3. setPreloadSlots merges into existing state.
 * 4. setPreloadSlots injects an as_of timestamp when the caller
 *    didn't supply one.
 * 5. clearPreload empties state.
 * 6. Pathname change triggers clearPreload (mock usePathname).
 * 7. Re-mounting provider in tests starts with empty state.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  PreloadProvider,
  usePreload,
  usePreloadOptional,
} from "./PreloadContext";

// Mock usePathname so we can control route changes between renders.
const mockUsePathname = vi.fn(() => "/nanny/development/c1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

beforeEach(() => {
  mockUsePathname.mockReturnValue("/nanny/development/c1");
});

describe("PreloadContext", () => {
  it("usePreload() outside the provider throws", () => {
    // Suppress React's error-boundary-style console noise for this case.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => usePreload())).toThrow(
      /usePreload must be used inside <PreloadProvider>/,
    );
    errSpy.mockRestore();
  });

  it("usePreloadOptional() outside the provider returns null", () => {
    const { result } = renderHook(() => usePreloadOptional());
    expect(result.current).toBeNull();
  });

  it("setPreloadSlots merges new slots into existing state", () => {
    const { result } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    act(() => {
      result.current.setPreloadSlots({
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    expect(result.current.preload.my_profile_basics?.first_name).toBe("Emma");
    act(() => {
      result.current.setPreloadSlots({
        children_profiles: [
          {
            child_id: "c1",
            profile: {
              id: "c1",
              first_name: "Oliver",
              date_of_birth: "2024-11-08",
              gender: "male",
              under_three: true,
              status: "active",
            },
          },
        ],
      });
    });
    // Both slots persist after the second merge.
    expect(result.current.preload.my_profile_basics?.first_name).toBe("Emma");
    expect(result.current.preload.children_profiles).toHaveLength(1);
  });

  it("setPreloadSlots auto-stamps as_of when not supplied", () => {
    const { result } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    expect(result.current.preload.as_of).toBeUndefined();
    const before = Date.now();
    act(() => {
      result.current.setPreloadSlots({
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    const after = Date.now();
    const stamped = result.current.preload.as_of;
    expect(stamped).toBeDefined();
    const stampedMs = new Date(stamped!).getTime();
    expect(stampedMs).toBeGreaterThanOrEqual(before);
    expect(stampedMs).toBeLessThanOrEqual(after);
  });

  it("multiple setPreloadSlots calls keep the EARLIEST as_of (verifier sees oldest age)", () => {
    const { result } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    // First publisher — earlier timestamp.
    act(() => {
      result.current.setPreloadSlots({
        as_of: "2026-05-09T01:00:00.000Z",
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    // Second publisher — later timestamp. The merged as_of MUST stay
    // at the earliest so the verifier never gets a payload that's
    // declared fresher than its oldest part.
    act(() => {
      result.current.setPreloadSlots({
        as_of: "2026-05-09T01:05:00.000Z",
        children_profiles: [
          {
            child_id: "c1",
            profile: {
              id: "c1",
              first_name: "Oliver",
              date_of_birth: "2024-11-08",
              gender: "male",
              under_three: true,
              status: "active",
            },
          },
        ],
      });
    });
    expect(result.current.preload.as_of).toBe("2026-05-09T01:00:00.000Z");
  });

  it("setPreloadSlots respects a caller-supplied as_of (no overwrite when older)", () => {
    const { result } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    act(() => {
      result.current.setPreloadSlots({
        as_of: "2026-05-09T01:00:00Z",
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    expect(result.current.preload.as_of).toBe("2026-05-09T01:00:00Z");
  });

  it("clearPreload empties the state", () => {
    const { result } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    act(() => {
      result.current.setPreloadSlots({
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    expect(result.current.preload.my_profile_basics).toBeDefined();
    act(() => {
      result.current.clearPreload();
    });
    expect(result.current.preload).toEqual({});
  });

  it("pathname change triggers clearPreload", () => {
    const { result, rerender } = renderHook(() => usePreload(), {
      wrapper: PreloadProvider,
    });
    act(() => {
      result.current.setPreloadSlots({
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    expect(result.current.preload.my_profile_basics).toBeDefined();
    // Simulate route change.
    mockUsePathname.mockReturnValue("/nanny/development/c2");
    rerender();
    // The pathname-change effect runs synchronously inside React's
    // commit phase — assert post-rerender.
    expect(result.current.preload).toEqual({});
  });

  it("re-mounting the provider starts with empty state (no leakage between tests)", () => {
    const first = renderHook(() => usePreload(), { wrapper: PreloadProvider });
    act(() => {
      first.result.current.setPreloadSlots({
        my_profile_basics: {
          first_name: "Emma",
          last_name: null,
          role: "nanny",
        },
      });
    });
    expect(first.result.current.preload.my_profile_basics).toBeDefined();
    first.unmount();
    const second = renderHook(() => usePreload(), { wrapper: PreloadProvider });
    expect(second.result.current.preload).toEqual({});
  });
});
