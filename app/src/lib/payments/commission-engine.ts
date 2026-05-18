/**
 * Commission engine — pure cent calculations + scheduling logic.
 *
 * Schedule (Bailey 2026-05-13 lock-in):
 * - Monthly: A$100 = 10,000 cents per cycle. Released 14 days
 *   after EACH parent payment lands.
 * - Upfront: A$1,000 = 100,000 cents total, split as A$500 / A$300 /
 *   A$200. Three instalments released 30 / 60 / 90 days after the
 *   upfront payment lands.
 *
 * NEVER use floating-point money — every input/output is integer cents.
 */

const MONTHLY_COMMISSION_CENTS = 10_000;
/** Upfront commission split, front-loaded. Sum = 100,000 cents = A$1,000. */
const UPFRONT_INSTALMENT_CENTS: Readonly<Record<1 | 2 | 3, number>> = {
  1: 50_000, // A$500
  2: 30_000, // A$300
  3: 20_000, // A$200
};
const UPFRONT_TOTAL_COMMISSION_CENTS =
  UPFRONT_INSTALMENT_CENTS[1] +
  UPFRONT_INSTALMENT_CENTS[2] +
  UPFRONT_INSTALMENT_CENTS[3];
/** Safeguard / release windows from the parent's payment date. */
const MONTHLY_RELEASE_DAYS = 14;
const UPFRONT_RELEASE_DAYS_BY_CYCLE: Readonly<Record<1 | 2 | 3, number>> = {
  1: 30,
  2: 60,
  3: 90,
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CommissionPlan = "monthly" | "upfront";

export interface CalculateCommissionInput {
  plan: CommissionPlan;
  /** Which cycle index is being scheduled (1-indexed). For monthly,
   *  always 1 since each call schedules the current cycle. For upfront,
   *  1 / 2 / 3 — used to pick which instalment chunk. */
  cycleIndex: 1 | 2 | 3;
}

/**
 * Returns the integer-cent commission for the given plan/cycle.
 *
 * Monthly: flat A$100 per cycle.
 * Upfront: A$500 (cycle 1) / A$300 (cycle 2) / A$200 (cycle 3).
 * Pure / deterministic / no side effects.
 */
export function calculateCommissionCents(
  input: CalculateCommissionInput,
): number {
  // Bounds-check cycleIndex for BOTH plans so a future caller that
  // widens the type (e.g. a cron passing a plain number) doesn't
  // silently get accepted on the monthly branch. The cycleIndex is
  // 1-indexed; values outside [1,3] are caller bugs.
  if (input.cycleIndex < 1 || input.cycleIndex > 3) {
    throw new Error(
      `Commission cycleIndex must be 1-3, got ${input.cycleIndex}`,
    );
  }
  if (input.plan === "monthly") {
    return MONTHLY_COMMISSION_CENTS;
  }
  return UPFRONT_INSTALMENT_CENTS[input.cycleIndex];
}

/**
 * Compute when a commission row's `scheduled_release_at` should be set.
 *
 * Bailey 2026-05-13:
 * - Monthly: 14 days after the parent payment lands.
 * - Upfront cycle 1: 30 days after the upfront payment.
 * - Upfront cycle 2: 60 days after the upfront payment.
 * - Upfront cycle 3: 90 days after the upfront payment.
 */
export function calculateScheduledReleaseAt(input: {
  plan: CommissionPlan;
  paymentLandedAt: Date;
  cycleIndex: 1 | 2 | 3;
}): Date {
  if (input.plan === "monthly") {
    return new Date(
      input.paymentLandedAt.getTime() + MONTHLY_RELEASE_DAYS * MS_PER_DAY,
    );
  }
  const days = UPFRONT_RELEASE_DAYS_BY_CYCLE[input.cycleIndex];
  return new Date(input.paymentLandedAt.getTime() + days * MS_PER_DAY);
}

/**
 * Compute the `period_start` and `period_end` for the cycle this
 * commission row covers. Each monthly cycle is a 30-day window from
 * the payment date; each upfront cycle is the corresponding 30-day
 * slice of the 90-day total.
 */
export function calculateCommissionPeriod(input: {
  plan: CommissionPlan;
  paymentLandedAt: Date;
  cycleIndex: 1 | 2 | 3;
}): { periodStart: Date; periodEnd: Date } {
  const offsetDays = input.plan === "monthly" ? 0 : (input.cycleIndex - 1) * 30;
  const start = new Date(
    input.paymentLandedAt.getTime() + offsetDays * MS_PER_DAY,
  );
  const end = new Date(start.getTime() + 30 * MS_PER_DAY);
  return { periodStart: start, periodEnd: end };
}

/**
 * Convenience export of the constants for tests + the
 * scheduleCommissionFor server action that wraps this engine.
 */
export const COMMISSION_CONSTANTS = {
  MONTHLY_COMMISSION_CENTS,
  UPFRONT_INSTALMENT_CENTS,
  UPFRONT_TOTAL_COMMISSION_CENTS,
  MONTHLY_RELEASE_DAYS,
  UPFRONT_RELEASE_DAYS_BY_CYCLE,
} as const;
