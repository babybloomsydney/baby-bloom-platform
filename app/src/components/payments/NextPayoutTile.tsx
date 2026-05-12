"use client";

/**
 * NextPayoutTile — top-of-page breakdown tile on `/nanny/payouts`.
 *
 * Spec: DSS §8 Q3 (Bailey 2026-05-12). Shows the next scheduled
 * payout to the nanny — actual date + amount + which family it's
 * coming from. Replaces vague "releasing soon" copy with concrete
 * information.
 *
 * Empty state: when the nanny has no pending/held payouts yet (every
 * connected family is in trial / lapsed / pre-Connect), surface a
 * neutral "First payout will appear here once a connected family
 * subscribes and the 14-day window passes" copy.
 */

import { Calendar } from "lucide-react";

interface NextPayoutTileProps {
  /** ISO timestamp of the next scheduled release. */
  scheduledReleaseAt: string | null;
  /** Amount in cents. Null when there's no pending payout. */
  amountAudCents: number | null;
  /** Parent first name for context. */
  parentFirstName?: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAud(cents: number): string {
  const dollars = cents / 100;
  return dollars.toFixed(dollars % 1 === 0 ? 0 : 2);
}

export function NextPayoutTile({
  scheduledReleaseAt,
  amountAudCents,
  parentFirstName,
}: NextPayoutTileProps) {
  if (!scheduledReleaseAt || amountAudCents == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Next payout
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Your first payout will appear here once a connected family subscribes
          and the 14-day window passes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
        Next payout
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-emerald-900">
          A${formatAud(amountAudCents)}
        </p>
        <p className="text-sm text-emerald-800">
          on {formatDate(scheduledReleaseAt)}
        </p>
      </div>
      {parentFirstName && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          For your work with {parentFirstName}&apos;s family.
        </p>
      )}
    </div>
  );
}
