/**
 * PreloadPublisher — small client wrapper that pushes the page's
 * server-loaded data into PreloadContext on mount.
 *
 * Pages stay server components (no rewrite). The publisher renders
 * nothing visible (zero DOM) and calls `setPreloadSlots` once via
 * `useEffect`. When the parent re-renders with a different `slots`
 * prop (e.g. nav-keep mounts a new child), the publisher re-fires.
 *
 * Spec: `Latency:Efficiency/06-implementation-plan.md §WU8`.
 */

"use client";

import { useEffect } from "react";
import { usePreloadOptional } from "@/contexts/PreloadContext";
import type { PreloadedContext } from "@/lib/chat/preload/types";

export interface PreloadPublisherProps {
  /** Slots to publish into PreloadContext. The page should pass the
   *  same shape its server-side data already has — the publisher is
   *  zero-cost (no fetches), it just hands the data over. */
  slots: Partial<PreloadedContext>;
}

export function PreloadPublisher({ slots }: PreloadPublisherProps) {
  // Destructure the stable function reference instead of depending on
  // the whole context value. The Provider rebuilds its `value` object
  // every render, so depending on `ctx` itself caused an infinite
  // re-render loop (effect fires → setPreloadSlots → state change →
  // new value object → effect fires again). The function below is
  // wrapped in useCallback inside PreloadProvider so its identity is
  // stable across renders.
  const setSlots = usePreloadOptional()?.setPreloadSlots;

  useEffect(() => {
    if (!setSlots) return;
    setSlots(slots);
  }, [setSlots, slots]);

  return null;
}
