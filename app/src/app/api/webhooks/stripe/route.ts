/**
 * Stripe webhook endpoint — main (parent-side) events.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5e–§5g + §7
 *      `system/APP/PAYMENTS/09-server-actions.md` (Webhook handlers)
 *
 * Events handled:
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
 *   200 — Stripe never retries. After a successful dispatch we set
 *   `processed_at = NOW()`. A handler that throws leaves processed_at
 *   NULL, the response is 500, and Stripe retries up to 3 days. The
 *   catch path also bumps retry_count + records the error message.
 *
 * Hardening:
 *   - Raw body is read via `req.text()` BEFORE any JSON parsing — Stripe
 *     signature is computed against the byte stream, not the parsed
 *     object. Buffering through Next.js's body parser would break the
 *     verification.
 *   - Two concurrent deliveries lose the INSERT race; only one runs the
 *     handler. The other returns 200 immediately.
 *   - Every handler is a pure DB operation — no calls back into Stripe
 *     unless the spec says so (e.g. retrieve subscription for the
 *     monthly current_period_end).
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { verifyWebhookSignature } from "@/lib/stripe/webhooks";

// Stripe webhook bodies are signed against the raw request bytes — opt
// out of any framework body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

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
    // The recorder failed to insert AND no row exists — most likely a
    // transient DB error. Return 500 so Stripe retries.
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
    // throughput. Stripe will redeliver, and the only consumer of
    // retry_count is the operator dashboard.
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
    // (or has) handled it. PostgREST surfaces this as code "23505".
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
    default:
      // Unknown event — log and acknowledge so Stripe doesn't retry.
      console.log("[stripe-webhook] unhandled event type", event.type);
      return;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  admin: AdminClient,
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const planMetadata = session.metadata?.plan;

  if (!userId) {
    console.warn(
      "[stripe-webhook] checkout.session.completed missing metadata.user_id",
      session.id,
    );
    return;
  }

  if (planMetadata !== "monthly" && planMetadata !== "upfront") {
    console.warn(
      "[stripe-webhook] checkout.session.completed unknown plan",
      planMetadata,
    );
    return;
  }

  const plan = planMetadata;
  const customerId = stringOrNull(session.customer);

  // Two-tab race defence: if a non-lapsed subscription exists for this
  // user with a different stripe_subscription_id, refund the duplicate.
  const { data: existing } = await admin
    .from("parent_subscriptions")
    .select("id, status, stripe_subscription_id, subscription_cycle")
    .eq("parent_user_id", userId)
    .maybeSingle();

  const sessionSubId = stringOrNull(session.subscription);
  if (
    existing &&
    existing.status !== "lapsed" &&
    existing.stripe_subscription_id !== sessionSubId
  ) {
    const paymentIntentId = stringOrNull(session.payment_intent);
    if (paymentIntentId) {
      try {
        const stripe = getStripeClient();
        await stripe.refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: `dup-refund-${session.id}` },
        );
      } catch (err) {
        console.error("[stripe-webhook] duplicate refund failed", err);
      }
    }
    await logActivity(admin, {
      action_type: "duplicate_checkout_refunded",
      user_id: userId,
      action_details: { session_id: session.id, plan },
    });
    return;
  }

  if (plan === "monthly") {
    if (!sessionSubId) {
      throw new Error(
        `checkout.session.completed monthly missing subscription id (${session.id})`,
      );
    }
    const stripe = getStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(sessionSubId);
    const periodEndUnix = readCurrentPeriodEnd(stripeSub);
    if (!periodEndUnix) {
      throw new Error(`Subscription ${sessionSubId} has no current_period_end`);
    }
    const nextCycle = (existing?.subscription_cycle ?? 0) + 1;
    const nowIso = new Date().toISOString();
    const periodEndIso = new Date(periodEndUnix * 1000).toISOString();

    const { error } = await admin.from("parent_subscriptions").upsert(
      {
        parent_user_id: userId,
        status: "active_monthly",
        stripe_customer_id: customerId,
        stripe_subscription_id: sessionSubId,
        paid_period_starts_at: nowIso,
        paid_period_ends_at: periodEndIso,
        has_used_trial: true,
        subscription_cycle: nextCycle,
      },
      { onConflict: "parent_user_id" },
    );
    if (error) {
      throw new Error(`parent_subscriptions upsert failed: ${error.message}`);
    }
  } else {
    // Upfront: paid_period_ends_at is the earliest child's 5th birthday.
    const fifthBirthdayIso = await earliestChildFifthBirthdayIso(admin, userId);
    const paymentIntentId = stringOrNull(session.payment_intent);
    const nowIso = new Date().toISOString();
    const { error } = await admin.from("parent_subscriptions").upsert(
      {
        parent_user_id: userId,
        status: "active_upfront",
        stripe_customer_id: customerId,
        stripe_payment_intent_id: paymentIntentId,
        paid_period_starts_at: nowIso,
        paid_period_ends_at: fifthBirthdayIso,
        has_used_trial: true,
      },
      { onConflict: "parent_user_id" },
    );
    if (error) {
      throw new Error(
        `parent_subscriptions upsert (upfront) failed: ${error.message}`,
      );
    }
  }

  await logActivity(admin, {
    action_type: "subscription_started",
    user_id: userId,
    action_details: { plan, session_id: session.id },
  });
}

async function handleSubscriptionUpdated(
  admin: AdminClient,
  event: Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const sub = event.data.object;
  const periodEndUnix = readCurrentPeriodEnd(sub);
  const updates: Record<string, unknown> = {};
  if (periodEndUnix) {
    updates.paid_period_ends_at = new Date(periodEndUnix * 1000).toISOString();
  }
  if (Object.keys(updates).length === 0) {
    return;
  }
  const { error } = await admin
    .from("parent_subscriptions")
    .update(updates)
    .eq("stripe_subscription_id", sub.id);
  if (error) {
    throw new Error(
      `parent_subscriptions update (sub.updated) failed: ${error.message}`,
    );
  }
}

async function handleSubscriptionDeleted(
  admin: AdminClient,
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
  const sub = event.data.object;
  const nowIso = new Date().toISOString();
  const { data: row, error } = await admin
    .from("parent_subscriptions")
    .update({ status: "cancelled", cancelled_at: nowIso })
    .eq("stripe_subscription_id", sub.id)
    .select("parent_user_id")
    .maybeSingle();
  if (error) {
    throw new Error(
      `parent_subscriptions update (sub.deleted) failed: ${error.message}`,
    );
  }
  if (row?.parent_user_id) {
    await logActivity(admin, {
      action_type: "subscription_cancelled",
      user_id: row.parent_user_id,
      action_details: { stripe_subscription_id: sub.id },
    });
  }
}

async function handleInvoiceSucceeded(
  admin: AdminClient,
  event: Stripe.InvoicePaymentSucceededEvent,
): Promise<void> {
  const invoice = event.data.object;
  const subId = stringOrNull(getInvoiceSubscription(invoice));
  if (!subId) {
    // Some invoices (e.g. one-off Stripe Tax) lack a subscription.
    return;
  }

  // Pull the latest period_end straight from Stripe so we don't drift.
  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(subId);
  const periodEndUnix = readCurrentPeriodEnd(stripeSub);
  const nowIso = new Date().toISOString();

  const updates: Record<string, unknown> = {
    paid_period_starts_at: nowIso,
  };
  if (periodEndUnix) {
    updates.paid_period_ends_at = new Date(periodEndUnix * 1000).toISOString();
  }

  // Restore from past_due if applicable.
  const { data: existing } = await admin
    .from("parent_subscriptions")
    .select("status, parent_user_id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();

  if (existing?.status === "past_due") {
    updates.status = "active_monthly";
    updates.past_due_grace_ends_at = null;
  }

  const { error } = await admin
    .from("parent_subscriptions")
    .update(updates)
    .eq("stripe_subscription_id", subId);
  if (error) {
    throw new Error(
      `parent_subscriptions update (invoice.succeeded) failed: ${error.message}`,
    );
  }

  if (existing?.status === "past_due" && existing.parent_user_id) {
    await logActivity(admin, {
      action_type: "subscription_recovered",
      user_id: existing.parent_user_id,
      action_details: { stripe_subscription_id: subId },
    });
  } else if (existing?.parent_user_id) {
    await logActivity(admin, {
      action_type: "subscription_renewed",
      user_id: existing.parent_user_id,
      action_details: { stripe_subscription_id: subId },
    });
  }
}

async function handleInvoiceFailed(
  admin: AdminClient,
  event: Stripe.InvoicePaymentFailedEvent,
): Promise<void> {
  const invoice = event.data.object;
  const subId = stringOrNull(getInvoiceSubscription(invoice));
  if (!subId) {
    return;
  }
  const graceEndsAtIso = new Date(Date.now() + ONE_WEEK_MS).toISOString();
  const { data: row, error } = await admin
    .from("parent_subscriptions")
    .update({
      status: "past_due",
      past_due_grace_ends_at: graceEndsAtIso,
    })
    .eq("stripe_subscription_id", subId)
    .select("parent_user_id")
    .maybeSingle();
  if (error) {
    throw new Error(
      `parent_subscriptions update (invoice.failed) failed: ${error.message}`,
    );
  }
  if (row?.parent_user_id) {
    await logActivity(admin, {
      action_type: "subscription_past_due",
      user_id: row.parent_user_id,
      action_details: { stripe_subscription_id: subId },
    });
  }
}

async function handlePaymentIntentFailed(
  admin: AdminClient,
  event: Stripe.PaymentIntentPaymentFailedEvent,
): Promise<void> {
  const intent = event.data.object;
  // Initial-charge failure on upfront plan. No DB write — the parent
  // never finished paying, so nothing was created. Log for forensics.
  const userId = intent.metadata?.user_id ?? null;
  await logActivity(admin, {
    action_type: "stripe_webhook_received",
    user_id: userId,
    action_details: {
      event: "payment_intent.payment_failed",
      payment_intent_id: intent.id,
      last_error: intent.last_payment_error?.message ?? null,
    },
  });
}

async function handleChargeRefunded(
  admin: AdminClient,
  event: Stripe.ChargeRefundedEvent,
): Promise<void> {
  const charge = event.data.object;
  const refundId = charge.refunds?.data?.[0]?.id ?? null;
  if (!refundId) {
    return;
  }
  const nowIso = new Date().toISOString();
  const { data: row, error } = await admin
    .from("refund_requests")
    .update({ refund_processed_at: nowIso, status: "approved" })
    .eq("stripe_refund_id", refundId)
    .select("id, parent_user_id")
    .maybeSingle();
  if (error) {
    throw new Error(
      `refund_requests update (charge.refunded) failed: ${error.message}`,
    );
  }
  if (row?.parent_user_id) {
    await logActivity(admin, {
      action_type: "refund_processed",
      user_id: row.parent_user_id,
      action_details: { refund_id: refundId, request_id: row.id },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringOrNull(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "id" in value) return value.id;
  return null;
}

/**
 * Reads `current_period_end` from a subscription. Stripe SDK shapes
 * differ across API versions — the field may live on the subscription
 * itself (legacy) or under the latest invoice / first item (newer).
 * We probe both safely without resorting to `any`.
 */
function readCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const candidate = (sub as unknown as { current_period_end?: unknown })
    .current_period_end;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  const itemEnd =
    sub.items?.data?.[0] &&
    (
      sub.items.data[0] as unknown as {
        current_period_end?: unknown;
      }
    ).current_period_end;
  if (typeof itemEnd === "number" && Number.isFinite(itemEnd)) {
    return itemEnd;
  }
  return null;
}

function getInvoiceSubscription(
  invoice: Stripe.Invoice,
): string | { id: string } | null {
  const value = (invoice as unknown as { subscription?: unknown }).subscription;
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return value as { id: string };
  }
  return null;
}

/**
 * Returns the ISO date for the earliest linked child's 5th birthday.
 * Used as `paid_period_ends_at` for the upfront plan.
 *
 * Falls back to "now + 5 years" when the parent has no linked children
 * yet (edge case — the upfront flow shouldn't be reachable without a
 * child, but we treat as defensive).
 */
async function earliestChildFifthBirthdayIso(
  admin: AdminClient,
  parentUserId: string,
): Promise<string> {
  const { data: rows, error } = await admin
    .from("child_client")
    .select("date_of_birth")
    .eq("parent_user_id", parentUserId)
    .not("date_of_birth", "is", null)
    .order("date_of_birth", { ascending: true })
    .limit(1);
  if (error) {
    console.error("[stripe-webhook] child_client lookup failed", error);
  }
  const dob = rows?.[0]?.date_of_birth;
  if (typeof dob === "string" && dob.length > 0) {
    return addYearsIso(dob, 5);
  }
  // Defensive fallback.
  const now = new Date();
  now.setFullYear(now.getFullYear() + 5);
  return now.toISOString();
}

function addYearsIso(dateIso: string, years: number): string {
  // dateIso may be 'YYYY-MM-DD' (DATE) or full timestamp. Normalise to
  // a Date and bump the year while keeping the same month/day.
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() + years);
    return fallback.toISOString();
  }
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

interface ActivityLogInput {
  action_type: string;
  user_id: string | null;
  action_details: Record<string, unknown>;
}

async function logActivity(
  admin: AdminClient,
  input: ActivityLogInput,
): Promise<void> {
  const { error } = await admin.from("activity_logs").insert({
    user_id: input.user_id,
    action_type: input.action_type,
    action_details: input.action_details,
  });
  if (error) {
    // Activity logging is best-effort — never block the handler on it.
    console.warn(
      "[stripe-webhook] activity_logs insert failed",
      error.code,
      input.action_type,
    );
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}
