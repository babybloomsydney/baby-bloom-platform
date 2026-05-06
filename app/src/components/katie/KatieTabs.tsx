"use client";

/**
 * KatieTabs — A-07.
 *
 * Two-tab strip rendered under the global header (DashboardNav) in
 * carousel mode (mobile, < 1280px). Replaces the previous icon-based
 * swap controls.
 *
 * ─── Visual model: Chrome browser tabs ────────────────────────────────
 *
 * The tab strip + header read as one continuous chrome zone (both
 * white, no border between them). At the bottom of the strip, a
 * violet 2px horizontal divider stretches the full viewport width —
 * this is the line separating the chrome from the deck body below.
 *
 * The active tab "sits on" that divider, with a matching violet
 * outline on its top, left and right edges, and NO outline on its
 * bottom. The active tab's bottom edge is pulled down 2px (`-mb-[2px]`)
 * so it overlaps the divider, and the tab is z-elevated above it.
 * The result: the divider is "broken" at the active tab's x-range,
 * because the active tab's body bg (matching the deck below) covers
 * that 2px of divider — and the violet outline continues seamlessly
 * across the top of the tab and across the strip's divider on either
 * side. One unified violet shape framing the active tab and the
 * chrome boundary.
 *
 * Inactive tabs have NO outline. Just text + hover state, sitting
 * directly on the white strip. The violet divider runs underneath
 * them uninterrupted. Visually they blend with the chrome zone.
 *
 * Active tab is wider than inactive (≈60/40 split). Both tabs use
 * the same violet brand colour for the active highlight — per user
 * feedback, the per-tab brand-colour split (violet for Katie,
 * emerald for Bloom) was reverted in favour of a unified violet
 * treatment with per-tab icons (sparkle / baby) carrying the
 * identity.
 *
 * ─── ARIA ─────────────────────────────────────────────────────────────
 *
 * `role="tablist"` on the container, `role="tab"` per button,
 * `aria-selected` reflects active state. Each tab carries an `id` and
 * `aria-controls` pointing at the matching tabpanel rendered by
 * `KatieShell` (`panel-katie` / `panel-main`). Roving tabindex.
 * Arrow / Home / End keys move focus AND swap decks (Automatic
 * Activation per WAI-ARIA APG).
 */

export const KATIE_TAB_ID = "tab-katie";
export const KATIE_PANEL_ID = "panel-katie";
export const MAIN_TAB_ID = "tab-main";
export const MAIN_PANEL_ID = "panel-main";

import { forwardRef, useRef, type ReactNode } from "react";
import { Baby } from "lucide-react";
import { useKatie } from "@/contexts/KatieContext";
import { SparkleIcon } from "./messages/SparkleIcon";

// ── TabButton ───────────────────────────────────────────────────────────

interface TabButtonProps {
  id: string;
  controls: string;
  active: boolean;
  /** Tailwind utility for the active tab head bg. Matches the deck
   *  body underneath so the tab and body merge seamlessly through
   *  the broken divider line. */
  activeBodyBg: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
  function TabButton(
    { id, controls, active, activeBodyBg, onClick, onKeyDown, children },
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
          // Base geometry. `relative` for stacking. `rounded-t-2xl`
          // (16px) gives a more pronounced browser-tab silhouette
          // than the prior 8px curve. Bottom corners stay square
          // — the active tab's bottom flows directly into the deck
          // body, sharing its colour.
          "relative rounded-t-2xl px-3 pt-2.5 pb-2 text-sm font-semibold transition-colors",
          // Width: active wider (~60/40 split).
          active ? "flex-[3] basis-0" : "flex-[2] basis-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2",
          active
            ? // Active: violet outline on top + sides; NO bottom
              // border. `z-10` keeps the tab above the strip's
              // absolute divider element (z-0) so the tab's body bg
              // covers — and "breaks" — the divider at its x-range.
              `${activeBodyBg} text-violet-700 border-2 border-violet-600 border-b-0 z-10 shadow-[0_-1px_2px_rgba(124,58,237,0.05)]`
            : // Inactive: NO outline. Pure text on the white strip,
              // blending with the chrome zone. Hover gives a subtle
              // bg + colour shift so it still reads as pressable.
              "bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        ].join(" ")}
      >
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
    // Strip wrapper: white bg (matches DashboardNav above — one chrome
    // zone). `sticky top-16` keeps it pinned just below the 64-px
    // DashboardNav when the BB-app deck content scrolls past, mirroring
    // the always-visible behaviour the Katie deck already enjoys (its
    // messages region scrolls internally so the strip never moves).
    // `relative` is the positioning context for the absolute violet
    // divider line at the strip's bottom; `pb-[2px]` reserves space
    // for the divider so it doesn't overlap tab content.
    <div
      role="tablist"
      aria-label="Switch deck"
      aria-orientation="horizontal"
      className="sticky top-16 z-30 relative flex w-full gap-1 bg-white px-1 pt-1 pb-[2px] xl:hidden"
    >
      {/* Full-width violet horizontal divider, painted at the strip's
          bottom edge. z-0 so the active tab (z-10) covers the divider
          at its x-range — the tab's body-coloured bg "breaks" the
          line where the deck flows up through. Replaces the previous
          `border-b-2` on the strip, which produced a faint hairline
          under the active tab on some pixel densities (sub-pixel
          rounding of `-mb-[2px]` + the border didn't always align
          perfectly). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-violet-600 z-0"
      />

      <TabButton
        ref={katieTabRef}
        id={KATIE_TAB_ID}
        controls={KATIE_PANEL_ID}
        active={isKatieActive}
        activeBodyBg="bg-[hsl(var(--color-katie-bg-beige))]"
        onClick={showKatie}
        onKeyDown={(e) => handleKeyDown(e, "katie")}
      >
        <span className="relative inline-flex items-center justify-center gap-1.5">
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
        activeBodyBg="bg-slate-50"
        onClick={showMain}
        onKeyDown={(e) => handleKeyDown(e, "main")}
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          <Baby
            aria-hidden="true"
            className={
              "h-4 w-4 shrink-0 " +
              (!isKatieActive ? "text-violet-600" : "text-slate-400")
            }
          />
          Bloom
        </span>
      </TabButton>
    </div>
  );
}
