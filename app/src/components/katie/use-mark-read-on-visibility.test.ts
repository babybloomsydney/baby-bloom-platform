/**
 * Tests for useMarkReadOnVisibility — the two mark-read pathways for
 * Katie's unread badge (carousel swap + desktop 2s-in-viewport).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMarkReadOnVisibility } from "./use-mark-read-on-visibility";

type SetUnreadMock = ((count: number) => void) & {
  mock: { calls: unknown[][] };
};

function makeSetUnread(): SetUnreadMock {
  return vi.fn() as unknown as SetUnreadMock;
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function fireVisibilityChange(): void {
  document.dispatchEvent(new Event("visibilitychange"));
}

function okResponse() {
  return Promise.resolve({ ok: true } as Response);
}

describe("useMarkReadOnVisibility — carousel swap (immediate)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let setUnreadCount: SetUnreadMock;

  beforeEach(() => {
    fetchSpy = vi.fn(() => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    setUnreadCount = makeSetUnread();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires mark-read when visibleDeck transitions main → katie", async () => {
    const { rerender } = renderHook(
      (props: { visibleDeck: "main" | "katie" }) =>
        useMarkReadOnVisibility({
          visibleDeck: props.visibleDeck,
          unreadCount: 0,
          setUnreadCount,
          isDesktop: false,
        }),
      { initialProps: { visibleDeck: "main" } },
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ visibleDeck: "katie" });
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/chat/mark-read", {
      method: "POST",
    });
    expect(setUnreadCount).toHaveBeenCalledWith(0);
  });

  it("does not fire when already on katie on mount", async () => {
    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "katie",
        unreadCount: 0,
        setUnreadCount,
        isDesktop: false,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fire on katie → main transition (closing Katie)", async () => {
    const { rerender } = renderHook(
      (props: { visibleDeck: "main" | "katie" }) =>
        useMarkReadOnVisibility({
          visibleDeck: props.visibleDeck,
          unreadCount: 0,
          setUnreadCount,
          isDesktop: false,
        }),
      { initialProps: { visibleDeck: "katie" } },
    );

    await act(async () => {
      rerender({ visibleDeck: "main" });
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("useMarkReadOnVisibility — desktop delayed mark-read", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let setUnreadCount: SetUnreadMock;

  beforeEach(() => {
    fetchSpy = vi.fn(() => okResponse());
    vi.stubGlobal("fetch", fetchSpy);
    setUnreadCount = makeSetUnread();
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires mark-read after 2s when unreadCount > 0 on desktop", async () => {
    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 3,
        setUnreadCount,
        isDesktop: true,
        delayMs: 2000,
      }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/chat/mark-read", {
      method: "POST",
    });
  });

  it("does not fire when unreadCount is 0", async () => {
    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 0,
        setUnreadCount,
        isDesktop: true,
        delayMs: 2000,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fire on narrow viewport (isDesktop=false)", async () => {
    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 3,
        setUnreadCount,
        isDesktop: false,
        delayMs: 2000,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fire when tab is hidden at effect start", async () => {
    setVisibility("hidden");

    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 3,
        setUnreadCount,
        isDesktop: true,
        delayMs: 2000,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("restarts the timer when the tab returns to visible", async () => {
    setVisibility("hidden");

    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 3,
        setUnreadCount,
        isDesktop: true,
        delayMs: 2000,
      }),
    );

    // Hidden window: no timer yet.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Tab becomes visible — timer starts fresh.
    await act(async () => {
      setVisibility("visible");
      fireVisibilityChange();
    });
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending timer when the tab is hidden mid-window", async () => {
    renderHook(() =>
      useMarkReadOnVisibility({
        visibleDeck: "main",
        unreadCount: 3,
        setUnreadCount,
        isDesktop: true,
        delayMs: 2000,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Hide tab halfway through — timer should clear.
    await act(async () => {
      setVisibility("hidden");
      fireVisibilityChange();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not double-POST when user swaps to katie mid-timer", async () => {
    const { rerender } = renderHook(
      (props: { visibleDeck: "main" | "katie" }) =>
        useMarkReadOnVisibility({
          visibleDeck: props.visibleDeck,
          unreadCount: 3,
          setUnreadCount,
          isDesktop: true,
          delayMs: 2000,
        }),
      { initialProps: { visibleDeck: "main" } },
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Pathway 1 fires immediately on swap (1 call).
    await act(async () => {
      rerender({ visibleDeck: "katie" });
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Desktop timer fires at t=2000 but sees visibleDeck === "katie"
    // and bails — no second call.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending timer when unreadCount drops to 0", async () => {
    const { rerender } = renderHook(
      (props: { unreadCount: number }) =>
        useMarkReadOnVisibility({
          visibleDeck: "main",
          unreadCount: props.unreadCount,
          setUnreadCount,
          isDesktop: true,
          delayMs: 2000,
        }),
      { initialProps: { unreadCount: 2 } },
    );

    // Advance halfway through the initial 2s window.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Drop unread to 0 — React runs the previous effect's cleanup,
    // which clearTimeout()s the pending handle.
    await act(async () => {
      rerender({ unreadCount: 0 });
    });
    // Advance past where the original timer would have fired.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("restarts the timer on a fresh unreadCount tick", async () => {
    const { rerender } = renderHook(
      (props: { unreadCount: number }) =>
        useMarkReadOnVisibility({
          visibleDeck: "main",
          unreadCount: props.unreadCount,
          setUnreadCount,
          isDesktop: true,
          delayMs: 2000,
        }),
      { initialProps: { unreadCount: 1 } },
    );

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Bump unreadCount — previous timer cancelled, new 2s timer starts.
    await act(async () => {
      rerender({ unreadCount: 2 });
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
