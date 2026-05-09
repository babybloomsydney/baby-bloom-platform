/**
 * Stripe Subscription wrappers — retrieve + cancel.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5e (cancellation
 * via Customer Portal — server-side cancel is the manual / admin path).
 *
 * Cancellation goes via `subscriptions.cancel` (immediate) — for parent
 * self-serve cancellation we use the Customer Portal (`portal.ts`).
 * This wrapper supports admin-initiated cancellation + reconciliation
 * cron.
 */

import { getStripeClient } from "./client";
import type { RetrievedSubscription } from "./types";
import type { StripeResult } from "@/types/payments";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

function extractCurrentPeriodEnd(sub: unknown): number | null {
  if (typeof sub !== "object" || sub === null) return null;
  const candidate = (sub as { current_period_end?: unknown })
    .current_period_end;
  return typeof candidate === "number" ? candidate : null;
}

function extractCustomerId(customer: unknown): string {
  if (typeof customer === "string") return customer;
  if (
    typeof customer === "object" &&
    customer !== null &&
    "id" in customer &&
    typeof (customer as { id: unknown }).id === "string"
  ) {
    return (customer as { id: string }).id;
  }
  return "";
}

export async function retrieveSubscription(
  stripeSubId: string,
): Promise<StripeResult<RetrievedSubscription>> {
  if (!stripeSubId) {
    return {
      success: false,
      error: "retrieveSubscription requires stripeSubId",
    };
  }

  try {
    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.retrieve(stripeSubId);

    return {
      success: true,
      data: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: extractCurrentPeriodEnd(sub),
        customerId: extractCustomerId(sub.customer),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}

/**
 * Immediate cancellation. The parent loses the subscription right now —
 * paid_period_ends_at handling lives at the webhook layer. Self-serve
 * cancellation should route through the Customer Portal instead so
 * Stripe's "cancel at period end" semantics apply.
 */
export async function cancelSubscription(
  stripeSubId: string,
): Promise<StripeResult<RetrievedSubscription>> {
  if (!stripeSubId) {
    return {
      success: false,
      error: "cancelSubscription requires stripeSubId",
    };
  }

  try {
    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.cancel(stripeSubId);

    return {
      success: true,
      data: {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: extractCurrentPeriodEnd(sub),
        customerId: extractCustomerId(sub.customer),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
