"use client";

/**
 * CancelledInPeriodBanner — S3.5.
 *
 * Renders during the cancelled-with-future-period-end window — the
 * parent has cancelled but their paid period hasn't ended yet. Unlike
 * the lapsed banner (S3), this one IS closable: the parent has made
 * their decision, the banner just keeps the date visible for the rest
 * of the session.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S3.5.
 *
 * Locked-in copy (Bailey verbatim):
 *   "Your subscription has ended, but you'll still have access until
 *    {paid_period_ends_at | format}."
 *
 * Loss-aversion framing — "still have access until" frames the date
 * as the moment of loss, not the grace period. Endowment effect:
 * they had it, they're about to lose it.
 *
 * Closable + session-scoped dismissal via LocalStorage keyed on
 * childId. Re-renders fresh on a new session so the parent is
 * reminded as period-end approaches.
 *
 * No "track" terminology.
 */

import { useEffect, useState } from "react";
import { X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAuDate } from "@/lib/format/date";

export interface CancelledInPeriodBannerProps {
  /** Scopes the LocalStorage dismissal key per child. */
  childId: string;
  /** ISO timestamp for `parent_subscriptions.paid_period_ends_at`. */
  paidPeriodEndsAt: string;
  /** Called when the parent clicks the Resubscribe CTA. Omit to
   *  render the banner without a CTA — used when the parent is
   *  already on the Resubscribe destination page so the button
   *  would self-navigate (Bailey 2026-05-14). */
  onPrimaryCta?: () => void;
}

const STORAGE_KEY_PREFIX = "bb_cancelled_banner_dismissed_";

function getStorageKey(childId: string): string {
  return `${STORAGE_KEY_PREFIX}${childId}`;
}

export function CancelledInPeriodBanner({
  childId,
  paidPeriodEndsAt,
  onPrimaryCta,
}: CancelledInPeriodBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Read dismissal state from LocalStorage on mount. Done in an
  // effect so SSR + client agree on initial render (always show on
  // first paint; hydrate-hide if dismissed previously this session).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(getStorageKey(childId));
      if (stored === "1") setDismissed(true);
    } catch {
      // LocalStorage blocked / unavailable — banner stays visible.
    }
  }, [childId]);

  if (dismissed) return null;

  const handleDismiss = (): void => {
    setDismissed(true);
    try {
      window.localStorage.setItem(getStorageKey(childId), "1");
    } catch {
      // Storage failure is silent — banner is hidden in-memory for
      // this session even if we can't persist.
    }
  };

  const formattedDate = formatAuDate(paidPeriodEndsAt);

  return (
    <div
      role="status"
      className="flex w-full items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6"
    >
      <AlertCircle
        className="h-4 w-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <p className="flex-1 text-sm text-amber-900">
        <span className="font-semibold">Your subscription has ended,</span> but
        you&apos;ll still have access until {formattedDate}.
      </p>
      {onPrimaryCta && (
        <Button
          size="sm"
          className="shrink-0 bg-violet-600 hover:bg-violet-700"
          onClick={onPrimaryCta}
        >
          Resubscribe
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
