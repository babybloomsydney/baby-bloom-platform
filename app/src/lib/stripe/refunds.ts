/**
 * Stripe Refund wrapper — creates a refund against a captured PaymentIntent.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5g (charge.refunded
 * webhook) + `07-refund-policy.md` (decision matrix).
 *
 * Idempotency: `refund-${refundRequestId}-1`. The cycle suffix is fixed at
 * 1 because a refund_request only ever yields one Stripe refund. If a
 * follow-up partial refund is needed, it should live on a new
 * refund_requests row (and thus a different idempotency key).
 *
 * Business decisions (eligibility, calculation, auth) live at the action
 * layer (Phase 3). This wrapper just talks to Stripe.
 */

import { getStripeClient } from "./client";
import type { CreateRefundInput, CreateRefundOutput } from "./types";
import type { StripeResult } from "@/types/payments";
import type Stripe from "stripe";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

export async function createRefund(
  input: CreateRefundInput,
): Promise<StripeResult<CreateRefundOutput>> {
  const {
    paymentIntentId,
    amountCents,
    reason,
    bbReasonCategory,
    refundRequestId,
  } = input;

  if (!paymentIntentId || !refundRequestId) {
    return {
      success: false,
      error: "createRefund requires paymentIntentId + refundRequestId",
    };
  }

  if (amountCents !== undefined && amountCents < 0) {
    return {
      success: false,
      error: "createRefund: amountCents must be >= 0",
    };
  }

  try {
    const stripe = getStripeClient();

    const params: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
      ...(reason ? { reason } : {}),
      metadata: {
        refund_request_id: refundRequestId,
        ...(bbReasonCategory ? { bb_reason_category: bbReasonCategory } : {}),
      },
    };

    const refund = await stripe.refunds.create(params, {
      idempotencyKey: `refund-${refundRequestId}-1`,
    });

    return {
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status ?? "unknown",
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
