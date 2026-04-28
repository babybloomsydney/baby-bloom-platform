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
    // WU 8.11 diagnostic — added to debug parent visibility issue.
    // Remove once root cause is identified. Logs once per render cycle
    // when KatieShell would otherwise bail without rendering the deck.
    if (typeof window !== "undefined") {
      console.warn("[KatieShell] not rendering deck", {
        KATIE_UI_ENABLED,
        hasUser: !!user,
        userId: user?.id ?? null,
        role,
        path: window.location.pathname,
      });
    }
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
  return (
    <div
      className="flex min-h-screen w-full"
      style={{ ["--katie-bp" as string]: CAROUSEL_BP }}
    >
      {/* Katie column — visible side-by-side on wide; full-screen carousel panel on narrow */}
      <aside
        className={[
          "sticky top-0 flex h-screen border-r border-slate-200 bg-white",
          // Wide: ⅓ of the main width (approximated via max-w-xs) pinned left
          "xl:w-[336px] xl:flex-shrink-0",
          // Narrow: full-width carousel panel, shown/hidden via class
          "w-full xl:sticky",
          visibleDeck === "katie" ? "xl:relative" : "hidden xl:flex",
        ].join(" ")}
        aria-label="Katie"
      >
        <div className="w-full">
          <KatieDeck />
        </div>
      </aside>

      {/* Main deck — hidden when carousel is showing Katie; always visible on wide */}
      <main
        className={[
          "flex-1",
          visibleDeck === "main" ? "block" : "hidden xl:block",
        ].join(" ")}
      >
        {children}
      </main>
    </div>
  );
}
