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
import { KatieProvider, useKatie } from "@/contexts/KatieContext";
import { KatieDeck } from "./KatieDeck";
import { useAuth } from "@/contexts/AuthContext";
import { useKatieRealtime } from "./use-katie-realtime";
import {
  useIsDesktop,
  useMarkReadOnVisibility,
} from "./use-mark-read-on-visibility";

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
  return (
    <div
      className="flex min-h-dvh w-full"
      style={{ ["--katie-bp" as string]: CAROUSEL_BP }}
    >
      {/* Katie column — visible side-by-side on wide; full-screen carousel panel on narrow */}
      <aside
        className={[
          "sticky top-0 flex h-dvh min-w-0 overscroll-contain border-r border-slate-200 bg-white",
          // Wide: ⅓ of the main width (approximated via max-w-xs) pinned left
          "xl:w-[336px] xl:flex-shrink-0",
          // Narrow: full-width carousel panel, shown/hidden via class
          "w-full xl:sticky",
          visibleDeck === "katie" ? "xl:relative" : "hidden xl:flex",
        ].join(" ")}
        aria-label="Katie"
      >
        <div className="w-full min-w-0">
          <KatieDeck />
        </div>
      </aside>

      {/* Main deck — hidden when carousel is showing Katie; always visible on wide */}
      <main
        className={[
          "min-w-0 flex-1",
          visibleDeck === "main" ? "block" : "hidden xl:block",
        ].join(" ")}
      >
        {children}
      </main>
    </div>
  );
}
