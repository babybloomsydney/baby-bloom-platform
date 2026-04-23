"use client";

/**
 * Small icon button that opens Katie's deck. Intended for use in the Main
 * Deck header (DashboardNav) in carousel mode (narrow viewport).
 *
 * Behaviour:
 *   - Renders nothing if Katie isn't mounted (logged-out / flag off)
 *   - Hidden on xl+ where Katie is already visible side-by-side
 *   - Shows an unread badge when unreadCount > 0
 */

import { MessageCircle } from "lucide-react";
import { useKatieOptional } from "@/contexts/KatieContext";

export function KatieSwapButton() {
  const ctx = useKatieOptional();
  if (!ctx) return null;
  const { unreadCount, showKatie } = ctx;

  const label =
    unreadCount > 0 ? `Open Katie (${unreadCount} unread)` : "Open Katie";

  return (
    <button
      type="button"
      onClick={showKatie}
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 xl:hidden"
    >
      <MessageCircle className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
