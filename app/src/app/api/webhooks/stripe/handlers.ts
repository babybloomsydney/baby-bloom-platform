/**
 * Stripe webhook event handlers — pure DB-touching functions extracted
 * from the route entry point so the route file stays focused on
 * dispatch + idempotency.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5e–§5g
 *      `system/APP/PAYMENTS/09-server-actions.md` (Webhook handlers)
 *
 * Every exported handler takes the admin Supabase client + the strongly
 * typed Stripe event and either resolves (success → caller marks the
 * webhook processed) or throws (caller records the error + returns 500).
 *
 * Handlers MUST stay free of route-specific concerns (no NextResponse,
 * no signature verification, no idempotency table writes — those belong
 * to the route entrypoint).
 */

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import { scheduleCommissionFor } from "@/lib/payments/commission-scheduler";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminClient = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

export async function handleCheckoutCompleted(
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
    await upsertMonthlySubscription({
      admin,
      userId,
      sessionId: session.id,
      sessionSubId,
      customerId,
      existingCycle: existing?.subscription_cycle ?? 0,
    });
  } else {
    await upsertUpfrontSubscription({
      admin,
      userId,
      sessionId: session.id,
      paymentIntentId: stringOrNull(session.payment_intent),
      customerId,
    });
  }

  await logActivity(admin, {
    action_type: "subscription_started",
    user_id: userId,
    action_details: { plan, session_id: session.id },
  });

  // Schedule the trial-period commission row (Phase 7). Best-effort —
  // logged but not thrown, because:
  // - The subscription is already activated by this point; failing
  //   to schedule the commission row shouldn't reverse that.
  // - The cron-driven cycle-completed scheduling will fire later
  //   regardless, so worst case the nanny misses one cycle of
  //   trial-period commission. Bailey can manually backfill via
  //   the admin queue.
  // - `no_connected_nanny` is a benign reason (parent paid before
  //   linking a nanny); not an error.
  const { data: subRow } = await admin
    .from("parent_subscriptions")
    .select("id")
    .eq("parent_user_id", userId)
    .maybeSingle<{ id: string }>();
  if (subRow) {
    const result = await scheduleCommissionFor({
      parentSubscriptionId: subRow.id,
      trigger: "subscription_started",
      cycleIndex: 1,
    });
    if (!result.ok && result.reason === "db_error") {
      console.error(
        "[stripe-webhook] scheduleCommissionFor failed",
        result.detail,
      );
    }
  }
}

interface UpsertMonthlyArgs {
  admin: AdminClient;
  userId: string;
  sessionId: string;
  sessionSubId: string | null;
  customerId: string | null;
  existingCycle: number;
}

async function upsertMonthlySubscription(
  args: UpsertMonthlyArgs,
): Promise<void> {
  const { admin, userId, sessionId, sessionSubId, customerId, existingCycle } =
    args;
  if (!sessionSubId) {
    throw new Error(
      `checkout.session.completed monthly missing subscription id (${sessionId})`,
    );
  }
  const stripe = getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(sessionSubId);
  const periodEndUnix = readCurrentPeriodEnd(stripeSub);
  if (!periodEndUnix) {
    throw new Error(`Subscription ${sessionSubId} has no current_period_end`);
  }
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
      subscription_cycle: existingCycle + 1,
    },
    { onConflict: "parent_user_id" },
  );
  if (error) {
    throw new Error(`parent_subscriptions upsert failed: ${error.message}`);
  }
}

interface UpsertUpfrontArgs {
  admin: AdminClient;
  userId: string;
  sessionId: string;
  paymentIntentId: string | null;
  customerId: string | null;
}

async function upsertUpfrontSubscription(
  args: UpsertUpfrontArgs,
): Promise<void> {
  const { admin, userId, paymentIntentId, customerId } = args;
  const fifthBirthdayIso = await earliestChildFifthBirthdayIso(admin, userId);
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

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

export async function handleSubscriptionUpdated(
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

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

export async function handleSubscriptionDeleted(
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

// ---------------------------------------------------------------------------
// invoice.payment_succeeded
// ---------------------------------------------------------------------------

export async function handleInvoiceSucceeded(
  admin: AdminClient,
  event: Stripe.InvoicePaymentSucceededEvent,
): Promise<void> {
  const invoice = event.data.object;
  const subId = stringOrNull(getInvoiceSubscription(invoice));
  if (!subId) {
    // Some invoices (e.g. one-off Stripe Tax) lack a subscription.
    return;
  }

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

    // Schedule the commission row for the cycle just completed (Phase 7).
    // Only fire on a normal renewal — not on a past_due → active recovery
    // (the cycle wasn't fully completed in good standing).
    const { data: subRow } = await admin
      .from("parent_subscriptions")
      .select("id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle<{ id: string }>();
    if (subRow) {
      const cycleEnd = periodEndUnix
        ? new Date(periodEndUnix * 1000)
        : new Date();
      const result = await scheduleCommissionFor({
        parentSubscriptionId: subRow.id,
        trigger: "cycle_completed",
        cycleIndex: 1, // Monthly always 1; upfront cycles 2/3 fire from a separate end-of-cycle cron.
        cycleEndsAt: cycleEnd,
      });
      if (!result.ok && result.reason === "db_error") {
        console.error(
          "[stripe-webhook] scheduleCommissionFor (renewal) failed",
          result.detail,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// invoice.payment_failed
// ---------------------------------------------------------------------------

export async function handleInvoiceFailed(
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

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------

export async function handlePaymentIntentFailed(
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

// ---------------------------------------------------------------------------
// charge.refunded
// ---------------------------------------------------------------------------

export async function handleChargeRefunded(
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
 * itself (legacy) or under the first item (newer). Probe both safely.
 */
function readCurrentPeriodEnd(sub: Stripe.Subscription): number | null {
  const candidate = (sub as unknown as { current_period_end?: unknown })
    .current_period_end;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  const itemEnd =
    sub.items?.data?.[0] &&
    (sub.items.data[0] as unknown as { current_period_end?: unknown })
      .current_period_end;
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
 * Returns the ISO timestamp for the earliest linked child's 5th birthday.
 * Used as `paid_period_ends_at` for the upfront plan.
 *
 * Falls back to "now + 5 years" when the parent has no linked children
 * yet — defensive only; the upfront flow shouldn't be reachable without
 * at least one child connected.
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
