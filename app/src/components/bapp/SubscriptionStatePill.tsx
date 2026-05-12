"use client";

/**
 * SubscriptionStatePill — small contextual badge surfaced next to the
 * child's name on the development page. UX-FIX-PLAN FIX-8 (2026-05-12
 * audit).
 *
 * Before this, the development page was silent on trial / active /
 * cancelled-in-period / past-due states — three of four states
 * rendered identically. This pill is the lightest-touch positive-
 * state UI: a single short label that tells the nanny (or parent)
 * where this family currently sits.
 *
 * Variants:
 *   trial               → slate "Trial — Nd left"  (subtle)
 *   active_monthly      → green dot "Following"    (subtle)
 *   active_upfront      → green dot "Following"    (subtle)
 *   cancelled_in_period → amber "Cancelled · until D Mmm"
 *   past_due            → amber "Payment past due"
 *   lapsed              → handled by LapsedBanner (no pill needed)
 *   none                → no render
 */

import type { SubscriptionStateForPill } from "@/lib/payments/subscription-state-for-child";

interface Props {
  state: SubscriptionStateForPill;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function SubscriptionStatePill({ state }: Props) {
  if (state.kind === "none" || state.kind === "lapsed") return null;

  if (state.kind === "trial") {
    const days = state.daysRemaining;
    const label =
      days <= 0
        ? "Trial — ends today"
        : days === 1
          ? "Trial — 1 day left"
          : `Trial — ${days} days left`;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        {label}
      </span>
    );
  }

  if (state.kind === "active_monthly" || state.kind === "active_upfront") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <span
          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        Following
      </span>
    );
  }

  if (state.kind === "cancelled_in_period") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Cancelled · until {formatShortDate(state.paidPeriodEndsAt)}
      </span>
    );
  }

  if (state.kind === "past_due") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Payment past due · grace until {formatShortDate(state.graceEndsAt)}
      </span>
    );
  }

  return null;
}
