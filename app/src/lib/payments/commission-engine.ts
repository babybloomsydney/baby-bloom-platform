/**
 * Commission engine — pure cent calculations + scheduling logic.
 *
 * Spec: `system/APP/PAYMENTS/06-commission-system.md` §1.5 + §2.
 *
 * v1 LAUNCH: flat-rate commission. Engagement-based earnings are
 * deferred (see §4 + USAGE BONUS MODEL/). The shadow `earnings_events`
 * table is still written from day 1 for v2 launch, but this engine
 * does NOT read from it — payouts are flat per cycle.
 *
 * Amounts (FINAL for launch 2026-05-05):
 * - Monthly: A$100 = 10,000 cents per cycle (subscription_started OR cycle_completed)
 * - Upfront: A$1,000 = 100,000 cents total split 33,333 / 33,333 / 33,334 over 3 cycles
 *
 * NEVER use floating-point money — every input/output is integer cents.
 */

const MONTHLY_COMMISSION_CENTS = 10_000;
const UPFRONT_TOTAL_COMMISSION_CENTS = 100_000;
/** floor(100_000 / 3) — exact integer split. */
const UPFRONT_INSTALMENT_FLOOR = Math.floor(UPFRONT_TOTAL_COMMISSION_CENTS / 3);
/** Remainder folds into the LAST cycle so all instalments sum to exactly the total. */
const UPFRONT_LAST_INSTALMENT =
  UPFRONT_TOTAL_COMMISSION_CENTS - UPFRONT_INSTALMENT_FLOOR * 2;
/** 14-day post-payment safeguard window before commission is released. */
const SAFEGUARD_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CommissionTrigger = "subscription_started" | "cycle_completed";
export type CommissionPlan = "monthly" | "upfront";

export interface CalculateCommissionInput {
  plan: CommissionPlan;
  trigger: CommissionTrigger;
  /** Which cycle index is being scheduled (1-indexed). For monthly,
   *  always 1 since each call schedules the current cycle. For upfront,
   *  1 / 2 / 3 — used to pick which instalment chunk. */
  cycleIndex: 1 | 2 | 3;
}

/**
 * Returns the integer-cent commission for the given plan/trigger/cycle.
 *
 * Pure / deterministic / no side effects.
 */
export function calculateCommissionCents(
  input: CalculateCommissionInput,
): number {
  if (input.plan === "monthly") {
    return MONTHLY_COMMISSION_CENTS;
  }
  // Upfront: 33,333 / 33,333 / 33,334. The 4th+ cycle should NEVER be
  // scheduled for upfront — caller bug. Throw rather than silently
  // returning 0 (would underpay or over-schedule).
  if (input.cycleIndex < 1 || input.cycleIndex > 3) {
    throw new Error(
      `Upfront commission only covers cycles 1-3, got cycleIndex=${input.cycleIndex}`,
    );
  }
  return input.cycleIndex === 3
    ? UPFRONT_LAST_INSTALMENT
    : UPFRONT_INSTALMENT_FLOOR;
}

/**
 * Compute when a commission row's `scheduled_release_at` should be set.
 *
 * - `subscription_started` → paid_period_starts_at + 14 days.
 * - `cycle_completed`      → cycle_end + 14 days.
 *
 * The 14-day window is BB's defence against parent refunds /
 * chargebacks within 30-day Stripe window.
 */
export function calculateScheduledReleaseAt(input: {
  trigger: CommissionTrigger;
  paidPeriodStartsAt: Date;
  /** End of the cycle just completed (ignored when trigger is
   *  subscription_started). */
  cycleEndsAt?: Date;
}): Date {
  const anchor =
    input.trigger === "subscription_started"
      ? input.paidPeriodStartsAt
      : (input.cycleEndsAt ?? input.paidPeriodStartsAt);
  return new Date(anchor.getTime() + SAFEGUARD_WINDOW_DAYS * MS_PER_DAY);
}

/**
 * Compute the `period_start` and `period_end` for the cycle that this
 * commission row covers. Used to populate `nanny_payouts.period_start`
 * + `period_end`.
 *
 * - subscription_started: covers the trial period (parent_subscriptions.trial_started_at → trial_ends_at).
 *                         For upfront where no trial existed, covers paid_period_starts_at → +30 days.
 * - cycle_completed: covers the cycle_end - 30 days → cycle_end.
 */
export function calculateCommissionPeriod(input: {
  trigger: CommissionTrigger;
  paidPeriodStartsAt: Date;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  cycleEndsAt?: Date;
}): { periodStart: Date; periodEnd: Date } {
  if (input.trigger === "subscription_started") {
    if (input.trialStartedAt && input.trialEndsAt) {
      return {
        periodStart: input.trialStartedAt,
        periodEnd: input.trialEndsAt,
      };
    }
    // No trial (rare — upfront direct subscriber) → cover the first 30 days.
    return {
      periodStart: input.paidPeriodStartsAt,
      periodEnd: new Date(input.paidPeriodStartsAt.getTime() + 30 * MS_PER_DAY),
    };
  }
  // cycle_completed
  const end = input.cycleEndsAt ?? new Date();
  return {
    periodStart: new Date(end.getTime() - 30 * MS_PER_DAY),
    periodEnd: end,
  };
}

/**
 * Convenience export of the constants for tests + the
 * scheduleCommissionFor server action that wraps this engine.
 */
export const COMMISSION_CONSTANTS = {
  MONTHLY_COMMISSION_CENTS,
  UPFRONT_TOTAL_COMMISSION_CENTS,
  UPFRONT_INSTALMENT_FLOOR,
  UPFRONT_LAST_INSTALMENT,
  SAFEGUARD_WINDOW_DAYS,
} as const;
