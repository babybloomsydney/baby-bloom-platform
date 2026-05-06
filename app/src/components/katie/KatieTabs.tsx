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

import { forwardRef, useRef, type ReactNode } from "react";
import { useKatie } from "@/contexts/KatieContext";

// ── Visual building blocks ──────────────────────────────────────────────
//
// Per `web/design-quality.md`: designed states, intentional hierarchy.
// The active tab carries a violet-600 top accent bar — brand colour,
// 3px tall — that fully commits to "this is selected" without relying
// on subtle bg-tone differences (which previous smoke testing surfaced
// as too low-contrast against the white DashboardNav above).

interface TabButtonProps {
  id: string;
  controls: string;
  active: boolean;
  /** Tailwind utility for the active tab head bg. Matches the deck
   *  body underneath so the tab and body visually merge. */
  activeBg: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
  function TabButton(
    { id, controls, active, activeBg, onClick, onKeyDown, children },
    ref,
  ) {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls={controls}
        // Roving tabindex per the WAI-ARIA tabs pattern — only the
        // active tab is in the tab order.
        tabIndex={active ? 0 : -1}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={[
          // Geometry: rounded top corners, square bottom. Active gets
          // `-mb-px` to overlap the strip's bottom border, merging into
          // the deck body. `relative` lets the top accent bar position
          // absolutely against the tab. Padding pt-3 leaves room for
          // the 3px accent bar without shifting the label.
          "relative flex-1 rounded-t-lg pb-2.5 pt-3 px-4 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1",
          active
            ? // Active: deck-body bg + violet text + shadow lift.
              `-mb-px ${activeBg} text-violet-700 shadow-sm`
            : // Inactive: blends with slate-100 strip; muted text.
              "bg-transparent text-slate-500 hover:bg-slate-200/60 hover:text-slate-700",
        ].join(" ")}
      >
        {/* Top accent bar — only on the active tab. Brand violet,
            3px tall, full tab width minus rounded corners. The
            cleanest "selected" signal short of a colour swatch. */}
        {active && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-0 h-[3px] rounded-full bg-violet-600"
          />
        )}
        {children}
      </button>
    );
  },
);

interface UnreadBadgeProps {
  count: number;
  /** When true, a soft pulse animation runs on top of the static
   *  badge to signal new arrivals on the inactive tab. Skipped on
   *  prefers-reduced-motion. */
  pulse: boolean;
}

function UnreadBadge({ count, pulse }: UnreadBadgeProps) {
  const label = count > 9 ? "9+" : String(count);
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm"
    >
      {/* Soft halo pulse — `motion-safe:` gates the animation behind
          prefers-reduced-motion (per web/performance.md). The static
          badge underneath is enough on its own; the pulse just draws
          the eye when the tab is inactive and a new message arrives. */}
      {pulse && (
        <span
          aria-hidden="true"
          className="motion-safe:animate-ping absolute inset-0 rounded-full bg-violet-500 opacity-75"
        />
      )}
      <span className="relative">{label}</span>
    </span>
  );
}

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
      <TabButton
        ref={katieTabRef}
        id={KATIE_TAB_ID}
        controls={KATIE_PANEL_ID}
        active={isKatieActive}
        onClick={showKatie}
        onKeyDown={(e) => handleKeyDown(e, "katie")}
        // Active Katie tab matches the beige deck body so they merge.
        activeBg="bg-[hsl(var(--color-katie-bg-beige))]"
      >
        <span className="relative inline-flex items-center gap-1.5">
          Katie
          {unreadCount > 0 && (
            <UnreadBadge count={unreadCount} pulse={!isKatieActive} />
          )}
          {unreadCount > 0 && (
            // SR-only announcement of the badge count. Joins after
            // "Katie" with a leading comma so AT renders
            // "Katie, 3 unread messages" rather than "Katie 3".
            <span className="sr-only">
              {`, ${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
            </span>
          )}
        </span>
      </TabButton>

      <TabButton
        ref={mainTabRef}
        id={MAIN_TAB_ID}
        controls={MAIN_PANEL_ID}
        active={!isKatieActive}
        onClick={showMain}
        onKeyDown={(e) => handleKeyDown(e, "main")}
        // Active BabyBloom tab matches the slate-50 main deck body.
        activeBg="bg-slate-50"
      >
        BabyBloom
      </TabButton>
    </div>
  );
}
