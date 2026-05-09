/**
 * Stripe Customer wrapper — single function: create-or-fetch by user id.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5a (Customer
 * lifecycle for parents).
 *
 * Idempotency: `customer-create-${userId}`. Stripe returns the original
 * Customer on retry. The DB write (`parents.stripe_customer_id`) lives at
 * the action layer (Phase 3) — this wrapper is a pure pass-through.
 */

import { getStripeClient } from "./client";
import type {
  GetOrCreateCustomerInput,
  GetOrCreateCustomerOutput,
} from "./types";
import type { StripeResult } from "@/types/payments";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

/**
 * Create a Stripe Customer for the given BB user. Idempotent — repeated
 * calls return the same Customer because the idempotency key is stable.
 *
 * Caller is responsible for short-circuiting if `parents.stripe_customer_id`
 * already exists (avoids the round-trip for the common case).
 */
export async function getOrCreateCustomer(
  input: GetOrCreateCustomerInput,
): Promise<StripeResult<GetOrCreateCustomerOutput>> {
  const { email, name, userId } = input;

  if (!email || !userId) {
    return {
      success: false,
      error: "getOrCreateCustomer requires email + userId",
    };
  }

  try {
    const stripe = getStripeClient();
    const customer = await stripe.customers.create(
      {
        email,
        ...(name ? { name } : {}),
        metadata: { user_id: userId },
      },
      {
        idempotencyKey: `customer-create-${userId}`,
      },
    );

    return {
      success: true,
      data: { customerId: customer.id },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
