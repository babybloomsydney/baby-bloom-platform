"use client";

/**
 * Encapsulates the two mark-read pathways for Katie's unread badge:
 *
 *   1. Carousel swap (narrow viewport) — fires immediately when the user
 *      flips visibleDeck from "main" to "katie". Intent: the user chose
 *      to look at Katie, so the messages count as seen right away.
 *
 *   2. Desktop (≥1280px) — Katie's deck is always rendered side-by-side
 *      with the main content. There is no "open" event, so we fire
 *      mark-read 2 seconds after unreadCount becomes non-zero, provided
 *      the tab is visible. This matches the "2s in viewport" rule in
 *      system/APP/BLOOMBOT/PROACTIVE-MESSAGES.md.
 *
 * Both pathways reset unreadCount on success and swallow errors (polling
 * fallback in useKatieRealtime will re-sync the count at 30s intervals).
 *
 * This hook isolates the behaviour so it can be unit-tested with
 * renderHook + fake timers without dragging in the rest of the shell.
 */

import { useEffect, useRef, useState } from "react";
import type { VisibleDeck } from "@/contexts/KatieContext";

const DESKTOP_MIN_WIDTH = "(min-width: 1280px)";
const DESKTOP_MARK_READ_DELAY_MS = 2000;

/** True when the viewport is wide enough that Katie is always rendered. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_MIN_WIDTH);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    // Safari < 14 uses addListener / removeListener. addEventListener is
    // the modern API and covered by the browser targets we ship.
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

async function callMarkRead(
  setUnreadCount: (count: number) => void,
): Promise<void> {
  try {
    const res = await fetch("/api/chat/mark-read", { method: "POST" });
    if (res.ok) setUnreadCount(0);
  } catch {
    // Non-fatal; polling fallback will correct the count.
  }
}

export interface UseMarkReadOnVisibilityOptions {
  visibleDeck: VisibleDeck;
  unreadCount: number;
  /** Narrower than React's Dispatch — the hook only ever sets a literal 0. */
  setUnreadCount: (count: number) => void;
  isDesktop: boolean;
  /** @internal — test-only override for the desktop 2s delay. */
  delayMs?: number;
}

export function useMarkReadOnVisibility({
  visibleDeck,
  unreadCount,
  setUnreadCount,
  isDesktop,
  delayMs = DESKTOP_MARK_READ_DELAY_MS,
}: UseMarkReadOnVisibilityOptions): void {
  // Keep latest visibleDeck visible to Pathway 2's timer callback without
  // re-triggering its effect on every swap — Pathway 1 already handles
  // swap transitions, so retriggering would just cause churn.
  const visibleDeckRef = useRef(visibleDeck);
  visibleDeckRef.current = visibleDeck;

  // Pathway 1 — carousel swap to Katie fires mark-read immediately.
  const prevDeckRef = useRef(visibleDeck);
  useEffect(() => {
    const justOpened =
      prevDeckRef.current !== "katie" && visibleDeck === "katie";
    prevDeckRef.current = visibleDeck;
    if (!justOpened) return;
    void callMarkRead(setUnreadCount);
  }, [visibleDeck, setUnreadCount]);

  // Pathway 2 — desktop delayed mark-read. Katie's deck is always
  // rendered side-by-side on ≥1280px, so we fire mark-read after a
  // visibility grace period instead of on an open event.
  //
  // Gates:
  //   - isDesktop: narrow viewport uses the carousel pathway, not this one.
  //   - unreadCount > 0: no work to do when everything is already read.
  //   - document.visibilityState: if the tab becomes hidden we cancel
  //     the timer; if it returns to visible while unread messages remain,
  //     we restart the timer from scratch.
  //   - visibleDeckRef (at fire time): if the user swapped to Katie
  //     while the timer was pending, Pathway 1 has already fired —
  //     bail to avoid a double POST.
  useEffect(() => {
    if (!isDesktop) return;
    if (unreadCount === 0) return;
    if (typeof document === "undefined") return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const startTimer = () => {
      if (timerId !== null) return;
      timerId = setTimeout(() => {
        timerId = null;
        if (document.visibilityState === "hidden") return;
        // Pathway 1 handles the katie-deck case synchronously — skip to
        // avoid a duplicate mark-read POST when user swaps mid-timer.
        if (visibleDeckRef.current === "katie") return;
        void callMarkRead(setUnreadCount);
      }, delayMs);
    };

    const stopTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startTimer();
      } else {
        stopTimer();
      }
    };

    if (document.visibilityState === "visible") {
      startTimer();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [unreadCount, isDesktop, setUnreadCount, delayMs]);
}
