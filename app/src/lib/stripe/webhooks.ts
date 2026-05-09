/**
 * Stripe webhook signature verification.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §7 (Webhook
 * routing + idempotency).
 *
 * This is the ONLY wrapper that throws instead of returning a
 * `StripeResult` envelope — the calling route handler is expected to
 * convert thrown errors into a 400 response (Stripe interprets that as
 * "do not retry, our signature was wrong"). Any other error path returns
 * 500 so Stripe retries.
 */

import type Stripe from "stripe";

import { getStripeClient } from "./client";

/**
 * Verify the webhook signature and return the parsed Stripe event.
 *
 * @param rawBody  The exact request body as a string or Buffer. NEVER
 *                 a parsed JSON object — verification is HMAC over the
 *                 raw bytes.
 * @param signature The value of the `Stripe-Signature` request header.
 * @param secret   The webhook endpoint secret (env var). Different secrets
 *                 for the main vs Connect endpoints.
 *
 * @throws if the signature does not match. The route handler should
 *         catch this and return HTTP 400 without inserting any DB row.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string,
): Stripe.Event {
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  if (!secret) {
    throw new Error("Missing webhook secret");
  }

  const stripe = getStripeClient();
  // Stripe SDK throws Stripe.errors.StripeSignatureVerificationError on
  // mismatch; we let it bubble unchanged so the caller can distinguish.
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
