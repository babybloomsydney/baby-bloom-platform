"use client";

/**
 * ParentStateBannerHub — the parent-shell banner orchestrator.
 *
 * Sits above all parent-side routes (hub, development pages, etc.) and
 * surfaces the right state banner — or nothing — based on the parent's
 * current `parent_subscriptions` row.
 *
 * **CRITICAL: no banner during `trial` state.**
 *   Per memory `feedback_no_ambient_banners_during_trial` (2026-05-11)
 *   — Bailey explicitly rejects commercial-countdown banners in the
 *   product. Trial urgency is email-only (T-5 reminder cron). The
 *   product stays focused on child development; the email handles
 *   time-based money concerns. Past-due / cancelled / lapsed are
 *   genuine system-state failures and DO get banners.
 *
 * State → banner mapping:
 *   trial               → NONE (email-only urgency per memory)
 *   past_due            → PastDueBanner (grace end date)
 *   cancelled in-period → CancelledInPeriodBanner (period end date)
 *   lapsed              → LapsedBanner role=parent
 *   active_*            → NONE (positive-state UI lives elsewhere)
 *   no row              → NONE (pre-trial; paywall handles it)
 *
 * Multiple banners never co-render. The state machine is mutually
 * exclusive at the row level.
 */

import { useRouter } from "next/navigation";
import { PastDueBanner } from "./PastDueBanner";
import { CancelledInPeriodBanner } from "./CancelledInPeriodBanner";
import { LapsedBanner } from "./LapsedBanner";

export type ParentBannerState =
  | { kind: "none" }
  | { kind: "past_due"; graceEndsAt: string }
  | {
      kind: "cancelled_in_period";
      paidPeriodEndsAt: string;
      childIdForDismissalKey: string;
    }
  | { kind: "lapsed"; childFirstName?: string };

interface Props {
  state: ParentBannerState;
}

export function ParentStateBannerHub({ state }: Props) {
  const router = useRouter();

  if (state.kind === "none") return null;

  const goToSubscribe = () => router.push("/parent/subscribe");
  const goToSubscriptionPortal = () => router.push("/parent/subscription");

  if (state.kind === "past_due") {
    return (
      <PastDueBanner
        graceEndsAt={state.graceEndsAt}
        // The card-update path goes through Stripe Customer Portal,
        // surfaced via the management page's "Update payment method"
        // button. Routing the banner CTA there keeps the entry-point
        // unified rather than minting a fresh portal session inline.
        onUpdateCard={goToSubscriptionPortal}
      />
    );
  }

  if (state.kind === "cancelled_in_period") {
    return (
      <CancelledInPeriodBanner
        childId={state.childIdForDismissalKey}
        paidPeriodEndsAt={state.paidPeriodEndsAt}
        onPrimaryCta={goToSubscribe}
      />
    );
  }

  // lapsed
  return (
    <LapsedBanner
      role="parent"
      // childFirstName is required on the LapsedBanner type. On the
      // hub we may not have a single child context (parent could have
      // multiple). Fall back to a generic literal — "your child"
      // matches the COPY-AND-FRAMING.md fallback pattern.
      childFirstName={state.childFirstName ?? "your child"}
      onPrimaryCta={goToSubscribe}
    />
  );
}
