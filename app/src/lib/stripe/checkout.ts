/**
 * Stripe Checkout wrapper — creates a hosted Checkout Session for both
 * 'monthly' (subscription mode) and 'upfront' (one-time payment mode)
 * plans.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5b (Create
 * Checkout Session).
 *
 * **No idempotency key.** Bailey 2026-05-14: Session creation is
 * non-destructive (mints a URL; no money moves, $0 cost to duplicate).
 * The actual charge happens INSIDE Checkout, where Stripe handles
 * idempotency internally. Two completed checkouts → duplicate-refund
 * branch in handleCheckoutCompleted handles cleanup. Idempotency on
 * Session creation served no purpose AND introduced a 24-hour-cached-
 * error foot-gun that locked customers out after any transient 4xx.
 *
 * Idempotency stays on real-money operations: refunds.create,
 * transfers.create, customers.create.
 *
 * `cycleNumber` is now Session metadata only — it tells support which
 * iteration of subscribing this is, but is not part of any key.
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

    // No idempotency key. Bailey 2026-05-14 — root cause of two
    // separate "stuck at checkout" incidents this week was Stripe's
    // 24-hour idempotency-cache replaying a stale 4xx. The
    // mechanism wasn't earning its keep here:
    //
    //   - Creating a Checkout Session is non-destructive (just
    //     mints a URL; no money moves, no charges, $0 cost to
    //     duplicate).
    //   - A duplicate Session orphan expires harmlessly after 24h.
    //   - The actual charge happens INSIDE Checkout when the
    //     customer clicks Pay — Stripe handles that idempotency
    //     internally.
    //   - Our webhook handler already de-duplicates the dangerous
    //     case (two completed checkouts → duplicate refund branch
    //     in handleCheckoutCompleted).
    //
    // Idempotency keys stay on real-money operations only:
    // refunds.create, transfers.create, customers.create.
    const session = await stripe.checkout.sessions.create(params);

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
