"use client";

/**
 * ParentStateBannerHub — the parent-shell banner orchestrator.
 *
 * Sits above all parent-side routes (hub, development pages, etc.) and
 * surfaces the right state banner — or nothing — based on the parent's
 * current `parent_subscriptions` row. UX-FIX-PLAN FIX-3 (2026-05-12
 * audit) — before this, three of four payment-state banners existed
 * as components but were never imported, so every state except
 * lapsed-on-dev-page was invisible to the parent.
 *
 * Why a client component:
 *   - Provides the `router.push("/parent/subscribe")` handlers that
 *     each banner's CTA needs. The banner components are themselves
 *     client (they own dismissal state, animations, etc.).
 *   - Lets the server layout pass plain serialisable props (status +
 *     a handful of dates) without ferrying client callbacks across
 *     the boundary.
 *
 * State → banner mapping:
 *   trial            → TrialBanner (escalation by days remaining)
 *   past_due         → PastDueBanner (grace end date)
 *   cancelled in-period → CancelledInPeriodBanner (period end date)
 *   lapsed           → LapsedBanner role=parent (hub-level, generic)
 *   active_*         → nothing (positive-state UI lives elsewhere)
 *   trial expired (no row) → nothing here (handled by the
 *                            development-page paywall and /parent/subscribe)
 *
 * Multiple banners never co-render. The state machine is mutually
 * exclusive at the row level.
 */

import { useRouter } from "next/navigation";
import { TrialBanner } from "./TrialBanner";
import { PastDueBanner } from "./PastDueBanner";
import { CancelledInPeriodBanner } from "./CancelledInPeriodBanner";
import { LapsedBanner } from "./LapsedBanner";

export type ParentBannerState =
  | { kind: "none" }
  | { kind: "trial"; daysRemaining: number; childFirstName?: string }
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

  if (state.kind === "trial") {
    return (
      <TrialBanner
        daysRemaining={state.daysRemaining}
        childFirstName={state.childFirstName}
        onPrimaryCta={goToSubscribe}
      />
    );
  }

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
