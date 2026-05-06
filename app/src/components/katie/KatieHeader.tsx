"use client";

/**
 * Top bar of Katie's deck — wordmark only.
 *
 * A-07: the hamburger that previously toggled to the main deck has
 * been removed. The new KatieTabs component (rendered in KatieShell
 * above the carousel viewport on narrow widths) is the swap control.
 * Header bg matches the deck's scrapbook-beige theme so there's no
 * seam between the header and the body.
 */

export function KatieHeader() {
  return (
    <header className="flex items-center justify-between border-b border-slate-200/70 bg-[hsl(var(--color-katie-bg-beige))]/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="font-semibold text-violet-700">BabyBloom</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-900">Katie</span>
      </div>
    </header>
  );
}
