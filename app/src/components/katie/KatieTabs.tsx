"use client";

/**
 * KatieTabs — A-07.
 *
 * Two-tab strip rendered under the global header (DashboardNav) in
 * carousel mode (mobile, < 1280px). Replaces the previous icon-based
 * swap controls with a Chrome-browser-tab visual:
 *
 *   - Active tab head colour matches the deck body below it. With no
 *     border between the tab strip and the deck body, the tab and
 *     body visually merge into one continuous shape.
 *   - Inactive tab head: subtly recessed (slate-100) — clearly a
 *     button you can press, but lower in the visual hierarchy.
 *   - Active tab is wider than inactive (≈60/40 split).
 *   - Tap inactive tab → swap via the existing `KatieContext.showKatie` /
 *     `showMain`. The 300ms carousel slide animation continues to fire
 *     unchanged.
 *
 * Per-tab brand identity (web/design-quality.md "designed states"):
 *   - Katie:  violet accent bar + SparkleIcon + violet-700 text on active.
 *   - Bloom:  emerald accent bar + Baby icon  + emerald-700 text on active.
 * The two themes live in BRAND_THEMES below so a future add-tab is a
 * one-entry change.
 *
 * No new motion work besides the unread badge pulse (motion-safe gated).
 *
 * ARIA: `role="tablist"` on the container, `role="tab"` per button,
 * `aria-selected` reflects active state. Each tab carries an `id` and
 * `aria-controls` pointing at the matching tabpanel rendered by
 * `KatieShell` (`panel-katie` on the Katie aside, `panel-main` inside
 * the BB-app `<main>`). Arrow-key nav (Left/Right + Home/End) moves
 * focus between tabs AND swaps decks immediately — Automatic
 * Activation per the WAI-ARIA Authoring Practices "Tabs" pattern.
 */

export const KATIE_TAB_ID = "tab-katie";
export const KATIE_PANEL_ID = "panel-katie";
export const MAIN_TAB_ID = "tab-main";
export const MAIN_PANEL_ID = "panel-main";

import { forwardRef, useRef, type ReactNode } from "react";
import { Baby } from "lucide-react";
import { useKatie } from "@/contexts/KatieContext";
import { SparkleIcon } from "./messages/SparkleIcon";

// ── Per-tab visual themes ───────────────────────────────────────────────
//
// Each tab's identity is encoded as a small theme bag — bg colour to
// match the deck body, accent-bar colour for the brand top stripe, and
// text colour for the active label. Keeping these in one place makes
// the difference between Katie and Bloom legible at a glance and keeps
// future-tab additions to a single registry entry.

interface TabTheme {
  /** Active tab head bg — must match the deck body colour exactly so
   *  the tab and body merge without a seam. */
  activeBg: string;
  /** Brand-coloured accent bar across the top of the active tab. */
  accentBar: string;
  /** Active label colour. */
  activeText: string;
}

const KATIE_THEME: TabTheme = {
  activeBg: "bg-[hsl(var(--color-katie-bg-beige))]",
  accentBar: "bg-violet-600",
  activeText: "text-violet-700",
};

const BLOOM_THEME: TabTheme = {
  // BB-app feed already uses emerald (avatar bg-emerald-50 etc.) per
  // BAppLayout — the Bloom tab adopts that same family for a coherent
  // identity. Bg matches main deck slate-50 surface.
  activeBg: "bg-slate-50",
  accentBar: "bg-emerald-500",
  activeText: "text-emerald-700",
};

// ── TabButton ───────────────────────────────────────────────────────────

interface TabButtonProps {
  id: string;
  controls: string;
  active: boolean;
  theme: TabTheme;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
  function TabButton(
    { id, controls, active, theme, onClick, onKeyDown, children },
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
          // Geometry: rounded top corners, square bottom. `relative`
          // anchors the absolutely-positioned accent bar. `pt-3` leaves
          // room for the accent bar without shifting the label.
          "relative rounded-t-lg pb-2.5 pt-3 px-3 text-sm font-semibold transition-colors",
          // Width: active wider than inactive (≈60/40 split). Active is
          // basis-0 grow-[3]; inactive is basis-0 grow-[2].
          active ? "flex-[3] basis-0" : "flex-[2] basis-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1",
          active
            ? // Active: deck-body bg + brand text + shadow lift.
              `${theme.activeBg} ${theme.activeText} shadow-sm`
            : // Inactive: visibly recessed against the white strip;
              // clearly a button you can press without competing with
              // the active tab for attention.
              "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700",
        ].join(" ")}
      >
        {/* Brand accent bar — only on the active tab. 3px tall,
            rounded, inset slightly from the tab edges. */}
        {active && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-2 top-0 h-[3px] rounded-full ${theme.accentBar}`}
          />
        )}
        {children}
      </button>
    );
  },
);

// ── UnreadBadge ─────────────────────────────────────────────────────────

interface UnreadBadgeProps {
  count: number;
  /** When true, a soft pulse animation runs on top of the static badge
   *  to signal new arrivals on the inactive tab. Skipped on
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

// ── KatieTabs ───────────────────────────────────────────────────────────

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
    // Strip bg matches the DashboardNav above (white) so the header +
    // tab strip read as one continuous chrome zone — there's no seam
    // between them. NO bottom border on the strip: the active tab's
    // bottom edge meets its deck body directly, sharing the same colour
    // and visually merging into the body underneath (Chrome-tab
    // behaviour). Inactive tabs are slate-100 buttons that stand
    // alone against the white strip.
    <div
      role="tablist"
      aria-label="Switch deck"
      aria-orientation="horizontal"
      className="flex w-full gap-1 bg-white px-1 pt-1 xl:hidden"
    >
      <TabButton
        ref={katieTabRef}
        id={KATIE_TAB_ID}
        controls={KATIE_PANEL_ID}
        active={isKatieActive}
        theme={KATIE_THEME}
        onClick={showKatie}
        onKeyDown={(e) => handleKeyDown(e, "katie")}
      >
        <span className="relative inline-flex items-center gap-1.5">
          <SparkleIcon
            aria-hidden="true"
            className={
              "h-4 w-4 shrink-0 " +
              (isKatieActive ? "text-violet-600" : "text-slate-400")
            }
          />
          Katie
          {unreadCount > 0 && (
            <UnreadBadge count={unreadCount} pulse={!isKatieActive} />
          )}
          {unreadCount > 0 && (
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
        theme={BLOOM_THEME}
        onClick={showMain}
        onKeyDown={(e) => handleKeyDown(e, "main")}
      >
        <span className="inline-flex items-center gap-1.5">
          <Baby
            aria-hidden="true"
            className={
              "h-4 w-4 shrink-0 " +
              (!isKatieActive ? "text-emerald-500" : "text-slate-400")
            }
          />
          Bloom
        </span>
      </TabButton>
    </div>
  );
}
