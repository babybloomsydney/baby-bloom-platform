"use client";

/**
 * NannyEarningsBadge — small wallet tile rendered next to the avatar
 * in `DashboardNav` for nanny role only.
 *
 * Spec: DSS §8 Q2 (Bailey 2026-05-12) — nanny sees the total A$ value
 * + wallet icon, on every page, from the moment they add their first
 * child. Clicking routes to `/nanny/payouts` where the breakdown
 * lives (next payout, this month, per family).
 *
 * Copy rules:
 *  - Just the A$ value. NO "across N families" text per Bailey.
 *  - Format: `A$N` (no decimals; values are always whole hundreds).
 *
 * Fetch model: a single `/api/nanny/earnings-badge` GET on mount.
 * The value moves slowly (a new family is a manual user action), so
 * we don't poll. The next nav transition naturally re-fetches via
 * the badge re-mount.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { trackEvent } from "@/lib/analytics/trackEvent";

interface BadgePayload {
  totalAud: number;
  familyCount: number;
}

export function NannyEarningsBadge() {
  const [data, setData] = useState<BadgePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/nanny/earnings-badge", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as BadgePayload;
        if (!cancelled) setData(json);
      } catch {
        // Best-effort fetch; if it fails, the badge silently doesn't
        // render. Failure mode is "no wallet visible" — not a hard
        // error to the user.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide entirely until data lands (avoids a flash of A$0). The badge
  // is OK to skip on the very first render — it's not load-bearing
  // chrome.
  if (!data || data.familyCount === 0) return null;

  return (
    <Link
      href="/nanny/payouts"
      onClick={() =>
        trackEvent({
          event_name: "nanny_earnings_badge_clicked",
          user_role: "nanny",
        })
      }
      className="flex h-8 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      aria-label={`Open payouts dashboard — current cycle total A$${data.totalAud}`}
    >
      <Wallet className="h-4 w-4" aria-hidden="true" />
      <span>A${data.totalAud}</span>
    </Link>
  );
}
