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
  const ctx = usePreloadOptional();

  useEffect(() => {
    // No provider mounted (e.g. public pages, /admin) → silent no-op.
    // Defensive: PreloadProvider is in KatieShell which only mounts
    // for /nanny + /parent paths, so any publisher sitting outside
    // that subtree just does nothing rather than throwing.
    if (!ctx) return;
    ctx.setPreloadSlots(slots);
    // We intentionally re-run when `slots` changes (object identity);
    // the parent should memoize if stability matters for performance.
    // Mostly the parent renders this once per nav, so re-runs are
    // limited to the nav-keep-mounted-with-new-id case.
  }, [ctx, slots]);

  return null;
}
