"use client";

/**
 * EarningsExplainer — S12 collapsible info block.
 *
 * Veterans don't need this; new nannies do. Default-collapsed so
 * the dashboard stays scannable. Open it to read how cycles +
 * safeguard windows + frozen states work.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S12.
 *
 * NEVER uses "track" / "tracking" terminology.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function EarningsExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        How payouts work
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600">
          <p>You earn A$100 for each 30-day cycle a family stays subscribed.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Cycle 1 begins the moment the family subscribes.</li>
            <li>
              You see your A$100 immediately, but it&apos;s protected by a
              14-day window before reaching your bank account. This window keeps
              things safe for everyone.
            </li>
            <li>At day 30 the cycle ends; on day 44 your A$100 lands.</li>
            <li>A fresh A$100 cycle begins on day 31, paid on day 74.</li>
          </ul>
          <p className="font-medium text-slate-900">If a family cancels</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Past payouts you&apos;ve received are yours permanently.</li>
            <li>
              The cycle they cancelled DURING is frozen — not lost. If they
              resubscribe, frozen earnings unlock.
            </li>
          </ul>
          <p className="font-medium text-slate-900">
            If a family is on free trial
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              You see A$100 &quot;earned&quot; but it&apos;s locked. It converts
              to a paid cycle the moment they subscribe.
            </li>
            <li>
              If they don&apos;t subscribe before trial ends, the earnings
              freeze — still recoverable if they ever come back.
            </li>
          </ul>
          <p className="font-medium text-slate-900">How do I get paid?</p>
          <p>
            Set up your payout account once (Stripe walks you through it). From
            then on, payouts auto-transfer to your bank.
          </p>
        </div>
      )}
    </div>
  );
}
