"use server";

/**
 * Parent-initiated refund request.
 *
 * Validates input, computes the refund amount via the pure
 * `calculateRefund` engine, snapshots the breakdown into a
 * `refund_requests` row with `status='pending_review'`, logs activity.
 *
 * Spec: `system/APP/PAYMENTS/07-refund-policy.md` §3 +
 * `system/APP/PAYMENTS/09-server-actions.md` (Refund actions).
 *
 * Admin review (approve / deny / Stripe refund call + commission
 * cancellation) is a separate action in `src/lib/actions/admin/`
 * — not implemented in this pass.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateRefund, type RefundCase } from "@/lib/payments/refund-engine";

const MIN_REASON_TEXT_LENGTH = 50;

export interface SubmitRefundRequestInput {
  reasonCategory: RefundCase;
  reasonText: string;
}

export type SubmitRefundRequestResult =
  | { success: true; data: { requestId: string }; error: null }
  | { success: false; data: null; error: string };

export async function submitRefundRequest(
  input: SubmitRefundRequestInput,
): Promise<SubmitRefundRequestResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, data: null, error: "not_authenticated" };
  }

  if (
    !["major_problem", "reasonable_cause", "change_of_mind"].includes(
      input.reasonCategory,
    )
  ) {
    return { success: false, data: null, error: "invalid_reason_category" };
  }
  const trimmedText = input.reasonText.trim();
  if (trimmedText.length < MIN_REASON_TEXT_LENGTH) {
    return { success: false, data: null, error: "reason_too_short" };
  }

  const admin = createAdminClient();

  // Load the subscription. Refund flow is only for `active_upfront` per
  // spec — monthly cancellations route through Customer Portal instead.
  const { data: sub, error: subErr } = await admin
    .from("parent_subscriptions")
    .select(
      "id, status, paid_period_starts_at, paid_period_ends_at, stripe_payment_intent_id",
    )
    .eq("parent_user_id", user.id)
    .maybeSingle<{
      id: string;
      status: string;
      paid_period_starts_at: string | null;
      paid_period_ends_at: string | null;
      stripe_payment_intent_id: string | null;
    }>();
  if (subErr) {
    return { success: false, data: null, error: "subscription_lookup_failed" };
  }
  if (!sub) {
    return { success: false, data: null, error: "no_subscription" };
  }
  if (sub.status !== "active_upfront") {
    return { success: false, data: null, error: "refund_only_for_upfront" };
  }
  if (!sub.paid_period_starts_at || !sub.paid_period_ends_at) {
    return { success: false, data: null, error: "subscription_missing_dates" };
  }

  // Sum commission already paid against this subscription so the
  // refund formula deducts it (per spec for `reasonable_cause`).
  const { data: paidPayouts } = await admin
    .from("nanny_payouts")
    .select("amount_aud_cents")
    .eq("parent_subscription_id", sub.id)
    .eq("status", "paid");
  const commissionAlreadyPaidCents = (paidPayouts ?? []).reduce(
    (sum, row: { amount_aud_cents: number | null }) =>
      sum + (row.amount_aud_cents ?? 0),
    0,
  );

  // Snapshot the calculation at request time.
  const calc = calculateRefund({
    plan: "upfront",
    case: input.reasonCategory,
    paidAmountCents: 200_000, // upfront price per spec (A$2,000)
    paidPeriodStartsAt: new Date(sub.paid_period_starts_at),
    paidPeriodEndsAt: new Date(sub.paid_period_ends_at),
    asOfDate: new Date(),
    commissionAlreadyPaidCents,
  });

  const { data: created, error: insertErr } = await admin
    .from("refund_requests")
    .insert({
      parent_subscription_id: sub.id,
      parent_user_id: user.id,
      reason_category: input.reasonCategory,
      reason_text: trimmedText,
      calculated_refund_aud_cents: calc.refundAmountCents,
      calculation_breakdown: calc.breakdown,
      status: "pending_review",
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertErr) {
    console.error("[submitRefundRequest] insert failed", insertErr);
    return { success: false, data: null, error: "insert_failed" };
  }
  if (!created) {
    return { success: false, data: null, error: "insert_returned_no_row" };
  }

  await admin.from("activity_logs").insert({
    user_id: user.id,
    action_type: "refund_requested",
    action_details: {
      refund_request_id: created.id,
      parent_subscription_id: sub.id,
      reason_category: input.reasonCategory,
      calculated_refund_aud_cents: calc.refundAmountCents,
    },
  });

  return {
    success: true,
    data: { requestId: created.id },
    error: null,
  };
}

/**
 * Preview the refund amount without creating a row. Used by the
 * client-side form to show "If approved, your refund would be ~A$XXX"
 * as the parent fills the form. Returns the same breakdown as the
 * submit path so the parent sees an accurate preview of what they're
 * asking for.
 */
export async function previewRefundAmount(input: {
  reasonCategory: RefundCase;
}): Promise<
  | {
      success: true;
      data: { refundAmountCents: number; floored: boolean };
      error: null;
    }
  | { success: false; data: null; error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, data: null, error: "not_authenticated" };
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select("id, status, paid_period_starts_at, paid_period_ends_at")
    .eq("parent_user_id", user.id)
    .maybeSingle<{
      id: string;
      status: string;
      paid_period_starts_at: string | null;
      paid_period_ends_at: string | null;
    }>();
  if (!sub || sub.status !== "active_upfront") {
    return { success: false, data: null, error: "not_upfront" };
  }
  if (!sub.paid_period_starts_at || !sub.paid_period_ends_at) {
    return { success: false, data: null, error: "subscription_missing_dates" };
  }

  const { data: paidPayouts } = await admin
    .from("nanny_payouts")
    .select("amount_aud_cents")
    .eq("parent_subscription_id", sub.id)
    .eq("status", "paid");
  const commissionAlreadyPaidCents = (paidPayouts ?? []).reduce(
    (sum, row: { amount_aud_cents: number | null }) =>
      sum + (row.amount_aud_cents ?? 0),
    0,
  );

  const calc = calculateRefund({
    plan: "upfront",
    case: input.reasonCategory,
    paidAmountCents: 200_000,
    paidPeriodStartsAt: new Date(sub.paid_period_starts_at),
    paidPeriodEndsAt: new Date(sub.paid_period_ends_at),
    asOfDate: new Date(),
    commissionAlreadyPaidCents,
  });

  return {
    success: true,
    data: {
      refundAmountCents: calc.refundAmountCents,
      floored: calc.breakdown.floored,
    },
    error: null,
  };
}
