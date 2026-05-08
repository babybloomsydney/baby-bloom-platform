"use client";

/**
 * useTypewriter — V1.1 side fix 2b ("typewriter spoof").
 *
 * Smooths the streaming text shown in Katie's deck so that a server-
 * side or HTTP-buffered chunk doesn't land as a single block. Returns
 * a `visible` string that is always a prefix of the `target` and
 * advances toward `target` at `charsPerSecond` (default 50).
 *
 * The hook is a defensive UX layer — it does NOT fix the underlying
 * streaming buffering. When the SSE stream actually ticks
 * char-by-char, the typewriter just keeps up; when the SSE stream
 * delivers a single block, the typewriter visibly types it out so
 * the user perceives steady motion instead of "3 dots → wall of text".
 *
 * Accessibility: respects `prefers-reduced-motion`. When the OS
 * setting is on, the typewriter is bypassed entirely — `visible`
 * becomes `target` immediately. Callers may also pass
 * `reducedMotion: true` directly to override (useful for tests).
 *
 * Implementation notes:
 *   - Single `setInterval` ticking at the cadence implied by
 *     `charsPerSecond`. We advance by 1 char per tick (rather than
 *     N chars per second-shaped tick) to keep frame-budget steady.
 *   - When the target grows mid-stream, the next tick picks up
 *     from where it left off — no special "catch-up" mode.
 *   - When the target is replaced wholesale (e.g. new conversation
 *     turn), an `effect` resets `visible` to "" so the typewriter
 *     starts from the top of the new message.
 *   - Cleanup tears down the interval on unmount + on every
 *     dependency change to avoid leaked timers.
 */

import { useEffect, useRef, useState } from "react";

interface TypewriterOptions {
  /** Visible characters per second. Default: 50 (≈ 20ms / char). */
  charsPerSecond?: number;
  /** Override OS reduced-motion. When true the typewriter is
   *  bypassed and `visible === target`. When undefined the hook
   *  reads `matchMedia("(prefers-reduced-motion: reduce)")`. */
  reducedMotion?: boolean;
}

const DEFAULT_CHARS_PER_SECOND = 50;

function detectReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriter(
  target: string,
  options: TypewriterOptions = {},
): string {
  const charsPerSecond = options.charsPerSecond ?? DEFAULT_CHARS_PER_SECOND;
  const reducedMotion = options.reducedMotion ?? detectReducedMotion();

  const [visible, setVisible] = useState<string>(reducedMotion ? target : "");
  const targetRef = useRef(target);
  targetRef.current = target;

  // Reset when the target shrinks or is replaced. The cheap check
  // is "current visible is not a prefix of the new target" — that
  // covers replacement (new message) and shrinkage (retraction).
  useEffect(() => {
    setVisible((prev) => {
      if (target === "") return "";
      if (target.startsWith(prev)) return prev; // grow path — keep prefix
      return ""; // replacement — start over
    });
  }, [target]);

  // Shortcut for reduced motion — no interval needed.
  useEffect(() => {
    if (!reducedMotion) return;
    setVisible(target);
  }, [reducedMotion, target]);

  useEffect(() => {
    if (reducedMotion) return;
    const intervalMs = Math.max(1, Math.round(1000 / charsPerSecond));
    const id = setInterval(() => {
      setVisible((prev) => {
        const t = targetRef.current;
        if (prev.length >= t.length) return prev;
        return t.slice(0, prev.length + 1);
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [charsPerSecond, reducedMotion]);

  return visible;
}
