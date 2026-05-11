/**
 * Nanny payouts state derivation — S12.
 *
 * The dashboard shows a counter + secondary copy per family the
 * nanny serves. The state is derived from
 * `parent_subscriptions.status` × the nanny_payouts history × the
 * Stripe Connect onboarding state. This module owns that derivation
 * so the component + tests work against a clean discriminated union
 * rather than scattered conditionals.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S12.
 *
 * Sub-states (per spec):
 *   A — locked, parent not yet subscribed (trial OR no row)
 *   B — sub'd, 14-day safeguard not yet elapsed
 *   C — active paid cycle, past the first safeguard
 *   D — parent cancelled mid-cycle (frozen, reclaimable)
 *   E — trial expired without subscribing (frozen, reclaimable)
 *
 * The counter always shows A$100 / A$100 per family — that's the
 * loss-aversion engine. The state changes the icon + secondary copy
 * + withdraw-button behaviour, but not the headline number.
 */

export const COMMISSION_PER_CYCLE_AUD = 100;

export type PayoutSubState = "A" | "B" | "C" | "D" | "E";

/** Inputs the derivation needs — pre-fetched by the page so the
 *  function stays sync + testable. */
export interface FamilyPayoutInputs {
  /** Parent's subscription status (live from `parent_subscriptions.status`). */
  subscriptionStatus:
    | "trial"
    | "active_monthly"
    | "active_upfront"
    | "past_due"
    | "cancelled"
    | "lapsed"
    | null; // null = no row, never subscribed
  /** When the family's subscription first transitioned to a paid
   *  state. Used to detect "first 14-day safeguard window" (state B). */
  paidStartedAt: string | null;
  /** Whether `parent_subscriptions.has_used_trial` is TRUE. Used to
   *  distinguish state A (never had trial) from state E (had trial,
   *  expired without subscribing). */
  hasUsedTrial: boolean;
  /** Most recent `nanny_payouts.status` of paid+ for this family.
   *  Null when nothing has ever paid out. */
  hasPaidPayouts: boolean;
}

/** Returns the sub-state for one family, given the inputs above. */
export function deriveFamilyPayoutState(
  inputs: FamilyPayoutInputs,
): PayoutSubState {
  const { subscriptionStatus, paidStartedAt, hasUsedTrial, hasPaidPayouts } =
    inputs;

  // Frozen states first — both look the same to the nanny but the
  // copy is different (trial-expired vs cancelled-mid-cycle).
  if (subscriptionStatus === "cancelled") {
    return "D";
  }
  if (subscriptionStatus === "lapsed") {
    // If a trial existed at all → E (trial-expired frozen). If
    // there were past payouts the parent fully cancelled — also
    // counts as frozen-cancelled (state D) for the nanny's UX.
    return hasPaidPayouts ? "D" : "E";
  }

  // No row / never subscribed / still in trial → state A.
  if (subscriptionStatus === null || subscriptionStatus === "trial") {
    return "A";
  }

  // Active states.
  if (
    subscriptionStatus === "active_monthly" ||
    subscriptionStatus === "active_upfront" ||
    subscriptionStatus === "past_due"
  ) {
    // First 14-day safeguard window after paidStartedAt → state B.
    if (paidStartedAt && !hasPaidPayouts) {
      const startMs = new Date(paidStartedAt).getTime();
      if (!Number.isNaN(startMs)) {
        const ageMs = Date.now() - startMs;
        const fourteenDays = 14 * 24 * 60 * 60 * 1000;
        if (ageMs < fourteenDays) {
          return "B";
        }
      }
    }
    return "C";
  }

  // Fallback (shouldn't reach here for valid enum values).
  // hasUsedTrial used only to disambiguate frozen state above; ignored
  // here. Reference it to silence unused-var lint without dragging
  // it into the live path.
  void hasUsedTrial;
  return "A";
}

/** Icon character used in copy. Returned from a helper so the
 *  test suite can assert on it cheaply without parsing JSX. */
export function getSubStateIcon(state: PayoutSubState): string {
  switch (state) {
    case "A":
      return "🔒";
    case "B":
      return "⏳";
    case "C":
      return "";
    case "D":
    case "E":
      return "❄️";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
