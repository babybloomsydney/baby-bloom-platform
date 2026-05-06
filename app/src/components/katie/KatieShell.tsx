"use client";

/**
 * KatieShell — the two-deck wrapper.
 *
 * Desktop (≥1280px):
 *   [katie column ⅓ of main width][main content centered][empty right margin]
 *
 * Below 1280px:
 *   single viewport — carousel between the two decks, swipe or tap to swap.
 *   `currentDeck` state driven by KatieContext (toggled by header/nav icons).
 *
 * Hidden entirely when the user is not authenticated or NEXT_PUBLIC_KATIE_ENABLED
 * is not true. In those cases children render full-width as before.
 */

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { KatieProvider, useKatie } from "@/contexts/KatieContext";
import { KatieDeck } from "./KatieDeck";
import {
  KatieTabs,
  KATIE_PANEL_ID,
  KATIE_TAB_ID,
  MAIN_PANEL_ID,
  MAIN_TAB_ID,
} from "./KatieTabs";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { useAuth } from "@/contexts/AuthContext";
import { useKatieRealtime } from "./use-katie-realtime";
import type { UserRole } from "@/lib/auth/types";
import {
  useIsDesktop,
  useMarkReadOnVisibility,
} from "./use-mark-read-on-visibility";

/** Routes where the dashboard header + tabs should NOT render — e.g.
 *  the verification onboarding flow and the parent typeform. The
 *  per-role dashboard wrappers used to gate this themselves; A-07
 *  hoisted the header into KatieShell so this list moved with it.
 *  Kept centralised so future "distraction-free" routes only need
 *  one place to be added. */
const DISTRACTION_FREE_PATHS = [
  "/nanny/onboarding-verification",
  "/parent/request",
];

function isDistractionFreePath(pathname: string): boolean {
  return DISTRACTION_FREE_PATHS.some((p) => pathname.startsWith(p));
}

/** Maps the auth role to the value DashboardNav expects. The DashboardNav
 *  prop only accepts `"nanny" | "parent"`; admin / super_admin currently
 *  see no top-bar swap UI here (admin surfaces have their own chrome).
 *  Returns null when no recognised role is set. */
function dashboardNavRole(role: UserRole | null): "nanny" | "parent" | null {
  if (role === "nanny" || role === "parent") return role;
  return null;
}

const KATIE_UI_ENABLED =
  (process.env.NEXT_PUBLIC_KATIE_ENABLED ?? "").toLowerCase() === "true";

// Breakpoint tailored to LAYOUT.md spec. Swapping carousel kicks in below.
const CAROUSEL_BP = "1280px";

export function KatieShell({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();

  // Bail out for logged-out pages and when the flag is off — render children
  // full-width as before. Admin + super_admin now see the Katie deck too
  // (Phase 3 admin module enables inspection/edit of Katie herself via
  // Gemini Pro).
  if (!KATIE_UI_ENABLED || !user || !role) {
    return <>{children}</>;
  }

  return (
    <KatieProvider>
      <ShellInner>{children}</ShellInner>
    </KatieProvider>
  );
}

// ── Inner component that consumes the context ───────────────────────────

function ShellInner({ children }: { children: ReactNode }) {
  const { visibleDeck, unreadCount, setUnreadCount } = useKatie();
  const pathname = usePathname();
  const { role: authRole } = useAuth();

  // Realtime unread count + polling fallback
  useKatieRealtime();

  // Mark-read on carousel swap (immediate) + desktop 2s-in-viewport (delayed).
  const isDesktop = useIsDesktop();
  useMarkReadOnVisibility({
    visibleDeck,
    unreadCount,
    setUnreadCount,
    isDesktop,
  });

  // Header / tabs render only on full-chrome routes. Distraction-free
  // paths (verification onboarding, parent typeform) opt out so the
  // user's focus stays on the task.
  const showChrome = !isDistractionFreePath(pathname);
  const navRole = dashboardNavRole(authRole);

  // Tailwind's JIT picks up arbitrary values in template strings at build time.
  // We need a fixed CSS custom property for the carousel width switch.
  //
  // Mobile-viewport notes (real-soak fix 2026-05-06):
  //   • `min-h-dvh` / `h-dvh` (instead of `min-h-screen` / `h-screen`) makes
  //     the layout track the dynamic viewport. On iOS Safari, `100vh`
  //     measures with the URL bar hidden, so the bottom of an `h-screen`
  //     element extends past the visible area when the bar is showing —
  //     the user sees the input cut off + can scroll past into blank
  //     space. `dvh` updates with the visible viewport, fixing both.
  //   • `min-w-0` on the flex children is non-negotiable: a flex item's
  //     default `min-width: auto` is its intrinsic content width, so any
  //     deeply-nested wide content (long URL, table, code block) makes
  //     the item bulge past the viewport. The body's `overflow-x-hidden`
  //     then clips that overflow visually instead of wrapping it.
  //     Adding `min-w-0` lets the flex child shrink below its content
  //     width so overflow handling on the inner content (word-break,
  //     scroll bar, etc.) actually applies.
  //   • `overscroll-contain` on the aside prevents iOS rubber-band into
  //     blank space. Deliberately NOT using `overflow-hidden` — that
  //     would silently break any future `position: sticky` descendant.
  //     The `h-dvh` + `min-h-dvh` pair already prevents document-level
  //     scroll-past; overflow-hidden was belt-and-braces we don't need.
  // A-07 height contract:
  //   • Outer container: `h-dvh` on narrow viewports — drives the
  //     overall height budget so the inner row can deduct the tab
  //     strip's height naturally via flex-col distribution. Desktop
  //     (xl+) keeps `min-h-dvh` so the page can grow when content
  //     does (no carousel + no tab strip on desktop).
  //   • Inner row: `flex-1 min-h-0` so it consumes the leftover budget
  //     after the tabs and shrinks correctly when content overflows.
  //   • Aside: `h-full` on narrow (drives off the inner row height),
  //     `xl:h-dvh` on desktop (sticky to viewport since there's no
  //     tab strip eating into the budget).
  // Without this contract, `h-dvh` on the aside extended past the
  // shorter parent row (the row was viewport-minus-tabs-tall) by the
  // tab-strip height, clipping the input + footer below the fold on
  // iOS Safari (code-reviewer MED 2026-05-06).
  return (
    <div
      className="flex h-dvh w-full flex-col xl:h-auto xl:min-h-dvh"
      style={{ ["--katie-bp" as string]: CAROUSEL_BP }}
    >
      {/* A-07 fix: persistent header + tabs.
          - DashboardNav was previously rendered inside the per-role
            wrapper (NannyDashboard / ParentDashboard) which lived
            inside the swap-able main element. Swapping to Katie
            hid the entire main, taking the header with it. Hoisting
            into KatieShell makes the header constant across swaps —
            one global chrome regardless of deck.
          - Tabs sit directly under the header (no margin / gap)
            per spec §60. Hidden on desktop (xl+) where side-by-side
            renders both decks. */}
      {showChrome && navRole && <DashboardNav role={navRole} />}
      {showChrome && <KatieTabs />}

      <div className="flex w-full min-h-0 flex-1 xl:flex-row">
        {/* Katie column — visible side-by-side on wide; full-screen carousel panel on narrow.
            A-07: aside body adopts the scrapbook-beige bg so the active Katie tab head
            merges seamlessly with the body below it (Chrome-tab visual). Applied on
            both mobile + desktop per Bailey's confirmation that desktop should match.
            ARIA: this aside IS the tabpanel for the Katie tab — `role="tabpanel"`
            + `aria-labelledby` linkage replaces the prior `aria-label="Katie"`. */}
        <aside
          id={KATIE_PANEL_ID}
          role="tabpanel"
          aria-labelledby={KATIE_TAB_ID}
          className={[
            "sticky top-0 flex h-full min-w-0 overscroll-contain border-r border-slate-200 bg-[hsl(var(--color-katie-bg-beige))] xl:h-dvh",
            // Wide: ⅓ of the main width (approximated via max-w-xs) pinned left
            "xl:w-[336px] xl:flex-shrink-0",
            // Narrow: full-width carousel panel, shown/hidden via class
            "w-full xl:sticky",
            visibleDeck === "katie" ? "xl:relative" : "hidden xl:flex",
          ].join(" ")}
        >
          <div className="w-full min-w-0">
            <KatieDeck />
          </div>
        </aside>

        {/* Main deck — hidden when carousel is showing Katie; always visible on wide.
            We wrap children in a tabpanel div rather than putting the role on
            the <main> element itself so the existing main-landmark semantics
            stay intact (a11y-architect HIGH on tabpanel linkage). */}
        <main
          className={[
            "min-w-0 flex-1",
            visibleDeck === "main" ? "block" : "hidden xl:block",
          ].join(" ")}
        >
          <div
            id={MAIN_PANEL_ID}
            role="tabpanel"
            aria-labelledby={MAIN_TAB_ID}
            tabIndex={0}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
