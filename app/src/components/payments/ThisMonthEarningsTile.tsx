"use client";

/**
 * ThisMonthEarningsTile — sum of all earnings (paid + pending/held)
 * scheduled to release within the current calendar month.
 *
 * Spec: DSS §8 Q3 (Bailey 2026-05-12). Sits below the NextPayoutTile
 * on `/nanny/payouts`. Gives the nanny a rolling "this month so far"
 * view distinct from the cycle-total in the global header wallet.
 */

function formatAud(cents: number): string {
  const dollars = cents / 100;
  return dollars.toFixed(dollars % 1 === 0 ? 0 : 2);
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-AU", { month: "long" });
}

interface Props {
  totalAudCents: number;
  paidAudCents: number;
  pendingAudCents: number;
}

export function ThisMonthEarningsTile({
  totalAudCents,
  paidAudCents,
  pendingAudCents,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {currentMonthLabel()} earnings
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        A${formatAud(totalAudCents)}
      </p>
      {(paidAudCents > 0 || pendingAudCents > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {paidAudCents > 0 && (
            <p>
              <span className="font-medium text-emerald-700">
                A${formatAud(paidAudCents)}
              </span>{" "}
              landed
            </p>
          )}
          {pendingAudCents > 0 && (
            <p>
              <span className="font-medium text-amber-700">
                A${formatAud(pendingAudCents)}
              </span>{" "}
              releasing this month
            </p>
          )}
        </div>
      )}
    </div>
  );
}
