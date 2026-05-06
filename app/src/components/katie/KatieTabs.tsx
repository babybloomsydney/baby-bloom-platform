"use client";

/**
 * KatieTabs — A-07.
 *
 * Two-tab strip rendered under the header bar in carousel mode (mobile,
 * < 1280px). Replaces the previous icon-based swap controls
 * (KatieSwapButton + KatieHeader hamburger) with a Chrome-browser-tab
 * visual:
 *
 *   - Active tab head colour matches the body below it (no visible seam).
 *   - Inactive tab head: muted variant of the OTHER deck's colour,
 *     visually recessed.
 *   - Tap inactive tab → swap via the existing `KatieContext.showKatie` /
 *     `showMain`. The 300ms carousel slide animation continues to fire
 *     unchanged.
 *
 * No new motion work. Per the spec the existing carousel animation is
 * the only transition; the tab strip itself doesn't slide or morph.
 *
 * ARIA: `role="tablist"` on the container, `role="tab"` per button,
 * `aria-selected` reflects active state. Each tab carries an `id` and
 * `aria-controls` pointing at the matching tabpanel rendered by
 * `KatieShell` (`panel-katie` on the Katie aside, `panel-main` inside
 * the BB-app `<main>`). Arrow-key nav (Left/Right + Home/End) moves
 * focus between tabs AND swaps decks immediately — this is "Automatic
 * Activation" per the WAI-ARIA Authoring Practices "Tabs" pattern.
 * Activation is cheap (no panel load), so automatic is the correct
 * variant; manual (Space/Enter required to activate) would be over-
 * indexed for what is essentially a hard left/right swap.
 */

export const KATIE_TAB_ID = "tab-katie";
export const KATIE_PANEL_ID = "panel-katie";
export const MAIN_TAB_ID = "tab-main";
export const MAIN_PANEL_ID = "panel-main";

import { useRef } from "react";
import { useKatie } from "@/contexts/KatieContext";

export function KatieTabs() {
  const { visibleDeck, unreadCount, showKatie, showMain } = useKatie();

  const katieTabRef = useRef<HTMLButtonElement | null>(null);
  const mainTabRef = useRef<HTMLButtonElement | null>(null);

  const isKatieActive = visibleDeck === "katie";

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    side: "katie" | "main",
  ) {
    if (e.key === "ArrowRight" && side === "katie") {
      e.preventDefault();
      showMain();
      mainTabRef.current?.focus();
    } else if (e.key === "ArrowLeft" && side === "main") {
      e.preventDefault();
      showKatie();
      katieTabRef.current?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      showKatie();
      katieTabRef.current?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      showMain();
      mainTabRef.current?.focus();
    }
  }

  return (
    // Tab-strip wrapper has its own slate bg so the strip stands out
    // against the white DashboardNav above it (user feedback 2026-05-06).
    // Active tabs pop by matching their deck body colour (beige / slate-50);
    // inactive tabs blend with the strip and read as recessed.
    // `role="tablist"` + the per-tab `role="tab"` below give AT users the
    // standard tab pattern; `aria-orientation="horizontal"` is the
    // default but stating it makes the contract explicit.
    <div
      role="tablist"
      aria-label="Switch deck"
      aria-orientation="horizontal"
      className="flex w-full gap-1 border-b border-slate-200 bg-slate-100 px-1 pt-1 xl:hidden"
    >
      <button
        ref={katieTabRef}
        id={KATIE_TAB_ID}
        type="button"
        role="tab"
        aria-selected={isKatieActive}
        aria-controls={KATIE_PANEL_ID}
        // Keyboard contract — only the active tab is in the tab order
        // (roving tabindex). Arrow keys move focus AND swap decks
        // because swapping is cheap (no panel load) — Automatic
        // Activation per the WAI-ARIA APG tabs pattern.
        tabIndex={isKatieActive ? 0 : -1}
        onClick={showKatie}
        onKeyDown={(e) => handleKeyDown(e, "katie")}
        className={[
          // Chrome-tab geometry: rounded top corners, square bottom so
          // the active tab merges with the body below. Equal-width
          // (flex-1) so the two tabs split the strip evenly. `-mb-px`
          // on the active tab pulls it 1px down to overlap the strip's
          // bottom border, making the active tab visually contiguous
          // with the deck body underneath.
          "flex-1 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1",
          isKatieActive
            ? // Active: tab head matches deck body bg (beige) and pops
              // above the slate-100 strip bg. Subtle shadow gives the
              // chrome-tab "lifted" feel without animating layout.
              "-mb-px bg-[hsl(var(--color-katie-bg-beige))] text-slate-900 shadow-sm"
            : // Inactive: matches the slate-100 strip bg so it reads
              // as recessed into the bar; muted text colour keeps
              // hierarchy clear.
              "bg-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-700",
        ].join(" ")}
      >
        <span className="relative inline-flex items-center gap-1.5">
          Katie
          {/* Unread proactive-message badge migrated from the old
              KatieSwapButton. Visible only when count > 0. */}
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {unreadCount > 0 && (
            // Screen-reader announcement of the badge count, decoupled
            // from the visual marker so AT renders "Katie, 3 unread"
            // not "Katie 3" (ambiguous) or "Katie three" (mojibake).
            <span className="sr-only">
              {`, ${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
            </span>
          )}
        </span>
      </button>

      <button
        ref={mainTabRef}
        id={MAIN_TAB_ID}
        type="button"
        role="tab"
        aria-selected={!isKatieActive}
        aria-controls={MAIN_PANEL_ID}
        tabIndex={!isKatieActive ? 0 : -1}
        onClick={showMain}
        onKeyDown={(e) => handleKeyDown(e, "main")}
        className={[
          "flex-1 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1",
          !isKatieActive
            ? // Active: matches the main deck's slate-50 body bg, pops
              // above the slate-100 strip with subtle shadow.
              "-mb-px bg-slate-50 text-slate-900 shadow-sm"
            : // Inactive: blends with the slate-100 strip — recessed.
              "bg-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-700",
        ].join(" ")}
      >
        BabyBloom
      </button>
    </div>
  );
}
