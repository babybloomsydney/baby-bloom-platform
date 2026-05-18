"use client";

/**
 * PastDueBanner — S11.
 *
 * Renders above-fold on parent routes when
 * `parent_subscriptions.status === 'past_due'`. Distinct from the
 * S3 LapsedBanner — past-due users still have full app access during
 * the 7-day grace window. The banner is the urgency layer pushing
 * them to update their card before grace expires (which would flip
 * the row to lapsed).
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S11.
 *
 * Visual: amber (warning state, not failure). Pairs with the
 * shared amber palette established by LapsedBanner + the new
 * CancelledInPeriodBanner.
 *
 * NEVER uses "track" / "tracking" terminology.
 */

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAuDate } from "@/lib/format/date";

export interface PastDueBannerProps {
  /** ISO timestamp for `parent_subscriptions.past_due_grace_ends_at`. */
  graceEndsAt: string;
  /**
   * Called when the parent clicks the Update-payment-method CTA.
   * Typical implementation: opens a Stripe Customer Portal session
   * (via `createPortalSession` server action) so the parent can
   * replace the failing card.
   */
  /** Optional — omit when the parent is already on the
   *  /parent/subscription destination (Customer Portal source)
   *  so the button doesn't self-navigate. Bailey 2026-05-14. */
  onUpdateCard?: () => void;
}

export function PastDueBanner({
  graceEndsAt,
  onUpdateCard,
}: PastDueBannerProps) {
  const formatted = formatAuDate(graceEndsAt);
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
        <span className="font-semibold">
          Your last payment didn&apos;t go through.
        </span>{" "}
        Update your payment method by {formatted} to keep your subscription
        active.
      </p>
      {onUpdateCard && (
        <Button
          size="sm"
          className="shrink-0 bg-violet-600 hover:bg-violet-700"
          onClick={onUpdateCard}
        >
          Update payment method
        </Button>
      )}
    </div>
  );
}
