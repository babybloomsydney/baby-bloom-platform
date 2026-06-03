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

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Baby } from "lucide-react";
import { useKatie } from "@/contexts/KatieContext";
import { SparkleIcon } from "./messages/SparkleIcon";

// ── Chrome-tab silhouette as SVG ─────────────────────────────────────────
//
// Pure-CSS pseudo-elements couldn't carry the violet stroke along the
// outward bottom-corner flares, leaving the visible outline rectangular
// while the body fill extended past it — the "tab pinched at the bottom"
// look. SVG renders the entire silhouette as one path: the same arc
// radius (16px) on top corners and bottom-exterior corners, with both
// fill (body colour) and stroke (violet) applied along the same path.
// Two paths are drawn into the same SVG: a closed path including the
// baseline for the FILL, and an open path without the baseline for the
// STROKE (so no horizontal line is drawn at the bottom of the
// silhouette — that area merges seamlessly with the strip baseline /
// deck body below).
//
// We measure the button's actual width via ResizeObserver because the
// path's straight-edge segments are width-dependent. Height is fixed
// per the tab's padding + content, but width changes with the flexbox
// 60/40 split + viewport size.

const TAB_RADIUS = 16;

interface ChromeTabBackdropProps {
  fillColor: string;
  strokeColor: string;
  strokeWidth?: number;
}

function ChromeTabBackdrop({
  fillColor,
  strokeColor,
  strokeWidth = 1,
}: ChromeTabBackdropProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const r = TAB_RADIUS;

  // Closed path for FILL — includes the bottom baseline so the body
  // colour fills the whole silhouette including the flares.
  // Sweep-flag rules for the four arcs:
  //   • Bottom-exterior flares (LEFT and RIGHT): sweep-flag 0
  //     (counter-clockwise) so the arc bulges OUTWARD into the chrome
  //     zone — the Chrome-tab silhouette. Sweep-flag 1 here pulled the
  //     arc inward into the tab body, producing the "scooped" look.
  //   • Top corners (TL and TR): sweep-flag 1 (clockwise) so the arc
  //     curves inward into the tab body — standard rounded top corner.
  const closedPath =
    w > 0 && h > 0
      ? [
          `M ${-r} ${h}`,
          `A ${r} ${r} 0 0 0 0 ${h - r}`, // outward flare LEFT-bottom
          `L 0 ${r}`,
          `A ${r} ${r} 0 0 1 ${r} 0`, // TL corner
          `L ${w - r} 0`,
          `A ${r} ${r} 0 0 1 ${w} ${r}`, // TR corner
          `L ${w} ${h - r}`,
          `A ${r} ${r} 0 0 0 ${w + r} ${h}`, // outward flare RIGHT-bottom
          `Z`,
        ].join(" ")
      : "";

  // Open path for STROKE — same arcs + sides + top, but no bottom
  // baseline. The stroke ends at the flare endpoints on each side.
  const openPath =
    w > 0 && h > 0
      ? [
          `M ${-r} ${h}`,
          `A ${r} ${r} 0 0 0 0 ${h - r}`,
          `L 0 ${r}`,
          `A ${r} ${r} 0 0 1 ${r} 0`,
          `L ${w - r} 0`,
          `A ${r} ${r} 0 0 1 ${w} ${r}`,
          `L ${w} ${h - r}`,
          `A ${r} ${r} 0 0 0 ${w + r} ${h}`,
        ].join(" ")
      : "";

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      {w > 0 && h > 0 && (
        <svg
          className="absolute overflow-visible"
          style={{ left: -r, top: 0 }}
          width={w + 2 * r}
          height={h}
          viewBox={`${-r} 0 ${w + 2 * r} ${h}`}
        >
          <path d={closedPath} fill={fillColor} stroke="none" />
          <path
            d={openPath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

// ── TabButton ───────────────────────────────────────────────────────────

interface TabButtonProps {
  id: string;
  controls: string;
  active: boolean;
  /** CSS colour value for the SVG-painted body fill of the active
   *  tab. Matches the deck body colour underneath so the tab and
   *  body merge seamlessly through the broken divider line.
   *  No equivalent Tailwind class is applied to the button itself —
   *  the button is transparent and the SVG silhouette paints the
   *  rounded shape. (A bg utility on the button would re-introduce
   *  the underlying rectangle and its sharp corners would poke past
   *  the rounded SVG outline.) */
  activeBodyBgCss: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
  function TabButton(
    { id, controls, active, activeBodyBgCss, onClick, onKeyDown, children },
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
          // Base geometry. `relative` so the SVG backdrop can sit
          // absolutely beneath the tab's text + icon content.
          // `bg-transparent` is mandatory — see ActiveBodyBgCss prop
          // doc above. The button is a transparent hit-box; the SVG
          // alone paints the rounded chrome-tab silhouette.
          // `group` so the per-tab icon can react to button hover
          // via `group-hover:` (same violet shift as the label).
          "group relative bg-transparent px-3 pt-2.5 pb-2 text-sm font-semibold transition-colors",
          // Width: active wider (~60/40 split).
          active ? "flex-[3] basis-0" : "flex-[2] basis-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2",
          active
            ? // Active: SVG backdrop paints the chrome-tab silhouette
              // (rounded top + outward bottom flares + slate-200
              // stroke). `z-10` puts the active tab above the strip's
              // divider so the SVG's filled body bg covers the
              // divider line at the tab's x-range. No CSS bg /
              // border / radius applied here — the SVG carries them.
              "text-violet-700 z-10"
            : // Inactive: NO outline, NO backdrop. Hover changes
              // ONLY the text colour to brand violet — no bg
              // shimmer, no greying — so the tab strip stays a
              // calm chrome zone (per user feedback 2026-05-07).
              "text-slate-500 rounded-t-2xl hover:text-violet-600",
        ].join(" ")}
      >
        {active && (
          <ChromeTabBackdrop
            fillColor={activeBodyBgCss}
            // slate-200 (#e2e8f0) at 1px — exact match for the
            // universal tile outline (`border border-slate-200`) and
            // for the strip's bottom divider, so the active tab's
            // outline reads as one continuous line with the divider.
            strokeColor="#e2e8f0"
            strokeWidth={1}
          />
        )}
        <span className="relative z-10">{children}</span>
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

interface KatieTabsProps {
  /** Drives the right-tab label: nanny → "Nanny Portal", parent →
   *  "Parent Portal". Generic "Bloom" was replaced per user feedback
   *  (2026-05-07) — "Portal" frames the deck as the user's own
   *  workspace rather than a brand surface. */
  role: "nanny" | "parent";
}

export function KatieTabs({ role }: KatieTabsProps) {
  const { visibleDeck, unreadCount, showKatie, showMain } = useKatie();
  const portalLabel = role === "nanny" ? "Nanny Portal" : "Parent Portal";

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
      className="sticky top-16 z-30 relative flex w-full gap-1 bg-white px-4 pt-0 xl:hidden"
    >
      {/* Full-width slate-200 horizontal divider — same colour,
          thickness, and opacity as the universal tile outline
          (`border border-slate-200`) so the divider and the active
          tab's outline read as ONE continuous line. z-0 so the
          active tab (z-10) covers the divider at its x-range — the
          tab's body-coloured bg "breaks" the line where the deck
          flows up through. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-slate-200 z-0"
      />

      <TabButton
        ref={katieTabRef}
        id={KATIE_TAB_ID}
        controls={KATIE_PANEL_ID}
        active={isKatieActive}
        activeBodyBgCss="hsl(var(--color-katie-bg-lilac))"
        onClick={showKatie}
        onKeyDown={(e) => handleKeyDown(e, "katie")}
      >
        <span className="relative inline-flex items-center justify-center gap-1.5">
          <SparkleIcon
            aria-hidden="true"
            className={
              // Inactive icon adopts the same hover→violet rule as
              // the label (per user feedback 2026-05-07): the
              // sparkle and the word should track together. Group
              // hover propagates from the parent button.
              "h-4 w-4 shrink-0 transition-colors " +
              (isKatieActive
                ? "text-violet-600"
                : "text-slate-400 group-hover:text-violet-600")
            }
          />
          <span>
            Katie
            <sup className="ml-0.5 text-[0.6em] font-semibold tracking-wide text-sky-400">
              (BETA)
            </sup>
          </span>
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
        // slate-50 = #f8fafc — must match the BB-app deck body bg
        // so the tab silhouette and the body below merge through
        // the broken divider line.
        activeBodyBgCss="#f8fafc"
        onClick={showMain}
        onKeyDown={(e) => handleKeyDown(e, "main")}
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          <Baby
            aria-hidden="true"
            className={
              "h-4 w-4 shrink-0 transition-colors " +
              (!isKatieActive
                ? "text-violet-600"
                : "text-slate-400 group-hover:text-violet-600")
            }
          />
          {portalLabel}
        </span>
      </TabButton>
    </div>
  );
}
