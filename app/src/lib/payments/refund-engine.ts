/**
 * Refund engine — pure functions for calculating refund amounts.
 *
 * Used by `submitRefundRequest` (snapshot at request time) and the
 * admin queue. Pure / deterministic / no DB / no Stripe — all inputs
 * are passed in, all outputs are integer cents.
 *
 * Spec: `system/APP/PAYMENTS/07-refund-policy.md` §2.
 *
 * NEVER use floating-point money — every input/output is integer cents.
 */

const AVERAGE_DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RefundCase =
  /** ACL major problem — full pro-rata, no commission deduction. */
  | "major_problem"
  /** Reasonable cause — pro-rata MINUS commission already paid. */
  | "reasonable_cause"
  /** Default no for upfront; for monthly, no refund at all. */
  | "change_of_mind";

export interface CalculateRefundInput {
  plan: "monthly" | "upfront";
  case: RefundCase;
  /** Total amount the parent paid for the cycle / upfront. Integer cents. */
  paidAmountCents: number;
  /** Period start (subscription start for upfront, period start for monthly). */
  paidPeriodStartsAt: Date;
  /** Period end (5th birthday for upfront, current period end for monthly). */
  paidPeriodEndsAt: Date;
  /** When the refund is being requested. Defaults to now. */
  asOfDate?: Date;
  /** Total commission already PAID OUT to the nanny against this period.
   *  Only meaningful for `reasonable_cause` (deducted from the refund).
   *  Major problem ignores this — full pro-rata refund. Integer cents. */
  commissionAlreadyPaidCents?: number;
}

export interface CalculateRefundResult {
  /** Final refund amount in integer cents (always >= 0 — formula floored). */
  refundAmountCents: number;
  /** Inputs + intermediate values for the admin UI's "show working" display. */
  breakdown: {
    plan: "monthly" | "upfront";
    case: RefundCase;
    paidAmountCents: number;
    asOfDate: string;
    paidPeriodStartsAt: string;
    paidPeriodEndsAt: string;
    /** Used by upfront. */
    totalMonths?: number;
    /** Used by upfront. */
    monthsRemaining?: number;
    /** Used by monthly. */
    daysRemaining?: number;
    /** Used by monthly. */
    daysInPeriod?: number;
    proRataCents: number;
    commissionDeductedCents: number;
    rawAmountCents: number;
    floored: boolean;
  };
}

/**
 * Compute a refund amount in integer cents. Pure — no DB, no Stripe.
 *
 * Edge cases handled:
 * - asOfDate at or after paid_period_ends_at → 0 months/days remaining → 0 refund.
 * - Negative formula result (commission > remaining value) → floored to 0.
 * - Change-of-mind on monthly always → 0.
 * - 0-month edge for parents who signed up close to the 5th birthday.
 */
export function calculateRefund(
  input: CalculateRefundInput,
): CalculateRefundResult {
  const asOf = input.asOfDate ?? new Date();
  const commissionAlreadyPaidCents = input.commissionAlreadyPaidCents ?? 0;

  // Change of mind on monthly: no refund. Sub continues to period end + cancels.
  if (input.plan === "monthly" && input.case === "change_of_mind") {
    return {
      refundAmountCents: 0,
      breakdown: {
        plan: input.plan,
        case: input.case,
        paidAmountCents: input.paidAmountCents,
        asOfDate: asOf.toISOString(),
        paidPeriodStartsAt: input.paidPeriodStartsAt.toISOString(),
        paidPeriodEndsAt: input.paidPeriodEndsAt.toISOString(),
        proRataCents: 0,
        commissionDeductedCents: 0,
        rawAmountCents: 0,
        floored: false,
      },
    };
  }

  if (input.plan === "monthly") {
    // Days-based pro-rata for monthly. ACL major / reasonable cause both
    // pro-rata; major skips commission deduction.
    const periodStart = input.paidPeriodStartsAt.getTime();
    const periodEnd = input.paidPeriodEndsAt.getTime();
    const asOfMs = asOf.getTime();

    const daysInPeriod = Math.max(
      1,
      Math.round((periodEnd - periodStart) / MS_PER_DAY),
    );
    const daysRemainingRaw = Math.max(
      0,
      Math.ceil((periodEnd - Math.max(asOfMs, periodStart)) / MS_PER_DAY),
    );
    const daysRemaining = Math.min(daysRemainingRaw, daysInPeriod);

    // Pro-rata in cents — integer math: (paid * remaining) / total.
    const proRataCents = Math.floor(
      (input.paidAmountCents * daysRemaining) / daysInPeriod,
    );
    const commissionDeducted =
      input.case === "major_problem" ? 0 : commissionAlreadyPaidCents;
    const rawAmountCents = proRataCents - commissionDeducted;
    const refundAmountCents = Math.max(0, rawAmountCents);

    return {
      refundAmountCents,
      breakdown: {
        plan: input.plan,
        case: input.case,
        paidAmountCents: input.paidAmountCents,
        asOfDate: asOf.toISOString(),
        paidPeriodStartsAt: input.paidPeriodStartsAt.toISOString(),
        paidPeriodEndsAt: input.paidPeriodEndsAt.toISOString(),
        daysRemaining,
        daysInPeriod,
        proRataCents,
        commissionDeductedCents: commissionDeducted,
        rawAmountCents,
        floored: rawAmountCents < 0,
      },
    };
  }

  // Upfront — months-based pro-rata.
  const periodStartMs = input.paidPeriodStartsAt.getTime();
  const periodEndMs = input.paidPeriodEndsAt.getTime();
  const asOfMs = asOf.getTime();

  const totalMonths = Math.max(
    1,
    Math.ceil(
      (periodEndMs - periodStartMs) / MS_PER_DAY / AVERAGE_DAYS_PER_MONTH,
    ),
  );
  const monthsRemainingRaw = Math.max(
    0,
    Math.ceil(
      (periodEndMs - Math.max(asOfMs, periodStartMs)) /
        MS_PER_DAY /
        AVERAGE_DAYS_PER_MONTH,
    ),
  );
  const monthsRemaining = Math.min(monthsRemainingRaw, totalMonths);

  const proRataCents = Math.floor(
    (input.paidAmountCents * monthsRemaining) / totalMonths,
  );
  const commissionDeducted =
    input.case === "major_problem" ? 0 : commissionAlreadyPaidCents;
  const rawAmountCents = proRataCents - commissionDeducted;

  // change_of_mind on upfront: default deny → 0. Reviewer can override
  // by explicitly passing case='reasonable_cause' on admin side.
  if (input.case === "change_of_mind") {
    return {
      refundAmountCents: 0,
      breakdown: {
        plan: input.plan,
        case: input.case,
        paidAmountCents: input.paidAmountCents,
        asOfDate: asOf.toISOString(),
        paidPeriodStartsAt: input.paidPeriodStartsAt.toISOString(),
        paidPeriodEndsAt: input.paidPeriodEndsAt.toISOString(),
        totalMonths,
        monthsRemaining,
        proRataCents,
        commissionDeductedCents: 0,
        rawAmountCents: 0,
        floored: false,
      },
    };
  }

  const refundAmountCents = Math.max(0, rawAmountCents);
  return {
    refundAmountCents,
    breakdown: {
      plan: input.plan,
      case: input.case,
      paidAmountCents: input.paidAmountCents,
      asOfDate: asOf.toISOString(),
      paidPeriodStartsAt: input.paidPeriodStartsAt.toISOString(),
      paidPeriodEndsAt: input.paidPeriodEndsAt.toISOString(),
      totalMonths,
      monthsRemaining,
      proRataCents,
      commissionDeductedCents: commissionDeducted,
      rawAmountCents,
      floored: rawAmountCents < 0,
    },
  };
}
