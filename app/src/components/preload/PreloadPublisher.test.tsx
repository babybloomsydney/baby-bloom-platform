/**
 * Tests for PreloadPublisher.
 *
 * Per `Latency:Efficiency/07-test-plan.md §WU8`:
 *
 * 1. PreloadPublisher calls setPreloadSlots once on mount with the
 *    configured slots.
 * 2. PreloadPublisher does not re-call on unmount.
 * 3. PreloadPublisher re-fires when its slots prop changes (used
 *    when nav-keeping the page mounts a new child).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { PreloadPublisher } from "./PreloadPublisher";
import type { PreloadedContext } from "@/lib/chat/preload/types";

const setPreloadSlots = vi.fn();
const clearPreload = vi.fn();
const fakeCtxValue = {
  preload: {} as PreloadedContext,
  setPreloadSlots,
  clearPreload,
};

vi.mock("@/contexts/PreloadContext", () => ({
  usePreloadOptional: () => fakeCtxValue,
}));

describe("PreloadPublisher", () => {
  it("calls setPreloadSlots once on mount with the configured slots", () => {
    setPreloadSlots.mockClear();
    const slots: Partial<PreloadedContext> = {
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    };
    render(<PreloadPublisher slots={slots} />);
    expect(setPreloadSlots).toHaveBeenCalledOnce();
    expect(setPreloadSlots).toHaveBeenCalledWith(slots);
    cleanup();
  });

  it("does NOT re-call setPreloadSlots on unmount (no cleanup-time publish)", () => {
    setPreloadSlots.mockClear();
    const slots: Partial<PreloadedContext> = {
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    };
    const { unmount } = render(<PreloadPublisher slots={slots} />);
    expect(setPreloadSlots).toHaveBeenCalledOnce();
    unmount();
    // Still exactly one call — unmount does NOT trigger another publish.
    expect(setPreloadSlots).toHaveBeenCalledOnce();
  });

  it("re-fires when slots prop changes (nav-keep with new child)", () => {
    setPreloadSlots.mockClear();
    const slotsA: Partial<PreloadedContext> = {
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
    };
    const slotsB: Partial<PreloadedContext> = {
      children_profiles: [
        {
          child_id: "c2",
          profile: {
            id: "c2",
            first_name: "Lily",
            date_of_birth: "2025-09-08",
            gender: "female",
            under_three: true,
            status: "active",
          },
        },
      ],
    };
    const { rerender } = render(<PreloadPublisher slots={slotsA} />);
    expect(setPreloadSlots).toHaveBeenCalledTimes(1);
    expect(setPreloadSlots).toHaveBeenLastCalledWith(slotsA);
    act(() => {
      rerender(<PreloadPublisher slots={slotsB} />);
    });
    expect(setPreloadSlots).toHaveBeenCalledTimes(2);
    expect(setPreloadSlots).toHaveBeenLastCalledWith(slotsB);
    cleanup();
  });

  it("renders nothing visible (zero DOM)", () => {
    const slots: Partial<PreloadedContext> = {
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    };
    const { container } = render(<PreloadPublisher slots={slots} />);
    expect(container.innerHTML).toBe("");
    cleanup();
  });
});
