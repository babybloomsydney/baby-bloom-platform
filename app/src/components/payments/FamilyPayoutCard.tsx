"use client";

/**
 * FamilyPayoutCard — one row per family on the nanny payouts
 * dashboard (S12).
 *
 * Counter always shows A$100 / A$100 — the loss-aversion engine.
 * The icon + secondary copy + CTA change based on `state`.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S12.
 */

import Link from "next/link";
import { Lock, Hourglass, Snowflake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PayoutSubState } from "@/lib/payments/payouts-state";

export interface FamilyPayoutCardProps {
  /** Stable identifier — used to deep-link to the family detail page. */
  familyId: string;
  /** Display label, e.g. "Sarah's family — Lily". */
  label: string;
  parentFirstName: string;
  childFirstName: string;
  state: PayoutSubState;
  /** ISO timestamp of the last paid payout, if any. */
  lastPayoutAt: string | null;
  /**
   * ISO timestamp of the next scheduled payout for this family, if
   * any. Used in state-B / state-C secondary copy to surface the
   * actual release date (Bailey 2026-05-12) — replaces vague
   * "releasing soon" / "14 days after parent paid" copy.
   */
  nextReleaseAt?: string | null;
}

const SECONDARY_COPY: Record<
  PayoutSubState,
  (props: FamilyPayoutCardProps) => string
> = {
  A: (p) =>
    `Earned this trial period. Earnings convert when ${p.parentFirstName} subscribes.`,
  // DSS §3.1 banned-copy entry + §8 Q3 (Bailey 2026-05-12): show the
  // ACTUAL scheduled release date. No more "releasing soon" or
  // "14 days after parent paid" — the date is concrete.
  B: (p) =>
    p.nextReleaseAt
      ? `Next payout: ${formatDate(p.nextReleaseAt)}.`
      : `First payout window opens once the parent's first payment clears.`,
  C: (p) => {
    const lastPaid = p.lastPayoutAt
      ? `Last payout received ${formatDate(p.lastPayoutAt)}.`
      : null;
    const next = p.nextReleaseAt
      ? `Next payout: ${formatDate(p.nextReleaseAt)}.`
      : null;
    if (lastPaid && next) return `${lastPaid} ${next}`;
    return lastPaid ?? next ?? `Active cycle.`;
  },
  D: (p) =>
    `Frozen. ${p.parentFirstName} cancelled. Unlocks if they resubscribe. Past payouts unaffected.`,
  E: (p) =>
    `Frozen — trial expired. Unlocks if ${p.parentFirstName} ever subscribes.`,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StateIcon({ state }: { state: PayoutSubState }) {
  if (state === "A")
    return <Lock className="h-4 w-4 text-slate-500" aria-hidden="true" />;
  if (state === "B")
    return <Hourglass className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  if (state === "D" || state === "E")
    return <Snowflake className="h-4 w-4 text-sky-600" aria-hidden="true" />;
  return null;
}

export function FamilyPayoutCard(props: FamilyPayoutCardProps) {
  const secondary = SECONDARY_COPY[props.state](props);
  return (
    <Card data-testid={`family-payout-card-${props.familyId}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{props.label}</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-bold text-slate-900">
              A$100
              <span className="text-base font-normal text-slate-500">
                {" "}
                / A$100
              </span>
            </p>
            <StateIcon state={props.state} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{secondary}</p>
        </div>
        <Link
          href={`/nanny/payouts/${props.familyId}`}
          className="shrink-0 text-sm font-medium text-violet-600 hover:underline"
        >
          Details →
        </Link>
      </CardContent>
    </Card>
  );
}
