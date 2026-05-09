/**
 * Stripe Customer Portal wrapper — generates a hosted portal URL.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5d (Customer
 * Portal — cancel, update card).
 *
 * No idempotency key — portal sessions are short-lived single-use URLs
 * that should always be freshly minted per visit.
 */

import { getStripeClient } from "./client";
import type {
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
} from "./types";
import type { StripeResult } from "@/types/payments";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

export async function createPortalSession(
  input: CreatePortalSessionInput,
): Promise<StripeResult<CreatePortalSessionOutput>> {
  const { customerId, returnUrl } = input;

  if (!customerId || !returnUrl) {
    return {
      success: false,
      error: "createPortalSession requires customerId + returnUrl",
    };
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      success: true,
      data: { url: session.url },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
