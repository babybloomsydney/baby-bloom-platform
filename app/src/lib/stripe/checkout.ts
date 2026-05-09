/**
 * Stripe Checkout wrapper — creates a hosted Checkout Session for both
 * 'monthly' (subscription mode) and 'upfront' (one-time payment mode)
 * plans.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5b (Create
 * Checkout Session).
 *
 * Idempotency: `checkout-${parentUserId}-${cycleNumber}`. The cycle number
 * scopes the key so that a parent who cancels + resubscribes gets a fresh
 * session instead of the prior one.
 *
 * Two-tab race defence (the webhook handler refunding the duplicate)
 * lives at the action / webhook layer — this wrapper is a thin
 * pass-through.
 */

import { getStripeClient } from "./client";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionOutput,
} from "./types";
import type { StripeResult } from "@/types/payments";
import type Stripe from "stripe";

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

function priceIdForPlan(plan: "monthly" | "upfront"): string {
  return plan === "monthly"
    ? readEnv("STRIPE_PRICE_MONTHLY_ID")
    : readEnv("STRIPE_PRICE_UPFRONT_ID");
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<StripeResult<CreateCheckoutSessionOutput>> {
  const {
    plan,
    customerId,
    parentUserId,
    successUrl,
    cancelUrl,
    cycleNumber = 1,
  } = input;

  if (!customerId || !parentUserId || !successUrl || !cancelUrl) {
    return {
      success: false,
      error:
        "createCheckoutSession requires customerId, parentUserId, successUrl, cancelUrl",
    };
  }

  try {
    const stripe = getStripeClient();
    const priceId = priceIdForPlan(plan);

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: plan === "monthly" ? "subscription" : "payment",
      customer: customerId,
      client_reference_id: parentUserId,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: parentUserId,
        plan,
        cycle_number: String(cycleNumber),
      },
    };

    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `checkout-${parentUserId}-${cycleNumber}`,
    });

    if (!session.url) {
      return {
        success: false,
        error: "Stripe returned a session without a redirect URL",
      };
    }

    return {
      success: true,
      data: { url: session.url, sessionId: session.id },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
