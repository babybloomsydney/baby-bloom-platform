/**
 * Stripe webhook endpoint — main (parent-side) events.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5e–§5g + §7
 *      `system/APP/PAYMENTS/09-server-actions.md` (Webhook handlers)
 *
 * Events handled (delegated to `./handlers.ts`):
 *   - checkout.session.completed       → mint parent_subscriptions
 *   - customer.subscription.updated    → sync field changes
 *   - customer.subscription.deleted    → flip to 'cancelled'
 *   - invoice.payment_succeeded        → restore from past_due / extend period
 *   - invoice.payment_failed           → flip to 'past_due', set 7-day grace
 *   - payment_intent.payment_failed    → log only (no DB write — no charge)
 *   - charge.refunded                  → mark refund_requests row complete
 *
 * Idempotency contract:
 *   We INSERT a row in `stripe_webhook_events` keyed by stripe_event_id
 *   (UNIQUE) BEFORE dispatching. The unique-violation path no-ops with a
 *   200 — Stripe never retries a duplicate. After a successful dispatch
 *   we set `processed_at = NOW()`. A handler that throws leaves
 *   processed_at NULL, the response is 500, and Stripe retries up to 3
 *   days. The catch path also bumps retry_count + records the error
 *   message.
 *
 * Hardening:
 *   - Raw body is read via `req.text()` BEFORE any JSON parsing — Stripe
 *     signature is computed against the byte stream, not the parsed
 *     object. Buffering through Next.js's body parser would break the
 *     verification.
 *   - Two concurrent deliveries lose the INSERT race; only one runs the
 *     handler. The other returns 200 immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/stripe/webhooks";

import {
  type AdminClient,
  handleAccountDeauthorized,
  handleAccountUpdated,
  handleCapabilityUpdated,
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleInvoiceFailed,
  handleInvoiceSucceeded,
  handlePayoutCreated,
  handlePayoutFailed,
  handlePayoutPaid,
  handlePaymentIntentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "./handlers";

// Stripe webhook bodies are signed against the raw request bytes — opt
// out of any framework body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InsertEventResult {
  /** True when this caller owns the row and should run the handler. */
  shouldDispatch: boolean;
  /** True when the row already exists (any state). */
  duplicate: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new NextResponse("Missing signature header", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();

  const { shouldDispatch, duplicate } = await recordEvent(admin, event);
  if (!shouldDispatch) {
    if (duplicate) {
      return new NextResponse("Duplicate or in-progress", { status: 200 });
    }
    // Recorder failed AND no row exists — likely a transient DB error.
    // Return 500 so Stripe retries.
    return new NextResponse("Failed to record event", { status: 500 });
  }

  try {
    await dispatchEvent(admin, event);
    await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    return new NextResponse("OK", { status: 200 });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error(`[stripe-webhook] handler ${event.type} failed`, err);
    // Read-then-write retry_count update — race-tolerant for our
    // throughput. Stripe will redeliver, so a missed increment is fine.
    const { data: existing } = await admin
      .from("stripe_webhook_events")
      .select("retry_count")
      .eq("stripe_event_id", event.id)
      .maybeSingle();
    await admin
      .from("stripe_webhook_events")
      .update({
        processing_error: message,
        retry_count: (existing?.retry_count ?? 0) + 1,
      })
      .eq("stripe_event_id", event.id);
    return new NextResponse("Handler error", { status: 500 });
  }
}

async function recordEvent(
  admin: AdminClient,
  event: Stripe.Event,
): Promise<InsertEventResult> {
  const insertResp = await admin
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  if (insertResp.error) {
    // 23505 = unique_violation — duplicate event id, another worker is
    // (or has) handled it.
    if (insertResp.error.code === "23505") {
      return { shouldDispatch: false, duplicate: true };
    }
    console.error(
      "[stripe-webhook] stripe_webhook_events insert failed",
      insertResp.error,
    );
    return { shouldDispatch: false, duplicate: false };
  }

  if (!insertResp.data) {
    // No data returned even though no error — treat conservatively as a
    // duplicate. Better to drop than to double-process.
    return { shouldDispatch: false, duplicate: true };
  }

  return { shouldDispatch: true, duplicate: false };
}

async function dispatchEvent(
  admin: AdminClient,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        admin,
        event as Stripe.CheckoutSessionCompletedEvent,
      );
      return;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        admin,
        event as Stripe.CustomerSubscriptionUpdatedEvent,
      );
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        admin,
        event as Stripe.CustomerSubscriptionDeletedEvent,
      );
      return;
    case "invoice.payment_succeeded":
      await handleInvoiceSucceeded(
        admin,
        event as Stripe.InvoicePaymentSucceededEvent,
      );
      return;
    case "invoice.payment_failed":
      await handleInvoiceFailed(
        admin,
        event as Stripe.InvoicePaymentFailedEvent,
      );
      return;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(
        admin,
        event as Stripe.PaymentIntentPaymentFailedEvent,
      );
      return;
    case "charge.refunded":
      await handleChargeRefunded(admin, event as Stripe.ChargeRefundedEvent);
      return;
    case "account.updated":
      await handleAccountUpdated(admin, event as Stripe.AccountUpdatedEvent);
      return;
    case "account.application.deauthorized":
      await handleAccountDeauthorized(
        admin,
        event as Stripe.AccountApplicationDeauthorizedEvent,
      );
      return;
    case "capability.updated":
      await handleCapabilityUpdated(
        admin,
        event as Stripe.CapabilityUpdatedEvent,
      );
      return;
    case "payout.created":
      await handlePayoutCreated(admin, event as Stripe.PayoutCreatedEvent);
      return;
    case "payout.paid":
      await handlePayoutPaid(admin, event as Stripe.PayoutPaidEvent);
      return;
    case "payout.failed":
      await handlePayoutFailed(admin, event as Stripe.PayoutFailedEvent);
      return;
    default:
      // Unknown event — log and acknowledge so Stripe doesn't retry.
      console.log("[stripe-webhook] unhandled event type", event.type);
      return;
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}
