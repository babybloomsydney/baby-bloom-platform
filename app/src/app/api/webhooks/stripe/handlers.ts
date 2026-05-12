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
import {
  freezeInFlightCommissionForSubscription,
  unfreezeEarningsOnResubscribe,
} from "@/lib/payments/commission-freeze";

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
    // Phase 10.5 — if the parent had previously cancelled and is now
    // resubscribing, unfreeze any frozen commission rows so the
    // nanny gets their earnings on the next cycle.
    try {
      const { unfrozen } = await unfreezeEarningsOnResubscribe(subRow.id);
      if (unfrozen > 0) {
        await logActivity(admin, {
          action_type: "commission_released",
          user_id: userId,
          action_details: {
            parent_subscription_id: subRow.id,
            unfrozen_count: unfrozen,
            reason: "parent_resubscribed",
          },
        });
      }
    } catch (err) {
      console.error("[stripe-webhook] unfreeze on resub failed", err);
    }

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
    // Period-end probe missed on both SDK shapes — leaves us with
    // nothing to update. Log a warning so future Stripe-API-shape
    // drifts (per readCurrentPeriodEnd's SDK-gap note) are visible
    // rather than swallowed.
    console.warn(
      "[stripe-webhook] sub.updated had no current_period_end probe match",
      sub.id,
    );
    return;
  }

  // Read current status before writing. If the row is in a terminal
  // state (`cancelled` or `lapsed`), a stale customer.subscription.updated
  // replay must NOT silently refresh paid_period_ends_at — that would
  // mask a cancellation from the rest of the app (Katie chokepoint,
  // banners, dashboards). Skip when the Stripe-side subscription is
  // already in an inactive state too.
  //
  // Capture the read error: a transient DB failure here would otherwise
  // be misread as "no row → no-op" and Stripe would acknowledge a
  // legitimate event without applying it. Throw so the webhook retries.
  const { data: existing, error: existingErr } = await admin
    .from("parent_subscriptions")
    .select("status")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle<{ status: string }>();
  if (existingErr) {
    throw new Error(
      `parent_subscriptions status read (sub.updated) failed: ${existingErr.message}`,
    );
  }
  if (!existing) {
    // No row yet → nothing to update. Checkout completion creates the
    // row; if a stray sub.updated arrives before that, it's not ours
    // to act on.
    return;
  }
  const terminalLocalStatuses = new Set<string>(["cancelled", "lapsed"]);
  // Typed against Stripe.Subscription.Status so a Stripe API update
  // that renames any of these literals fails to compile rather than
  // silently dropping the guard.
  const inactiveStripeStatuses = new Set<Stripe.Subscription.Status>([
    "canceled",
    "unpaid",
    "incomplete_expired",
  ]);
  if (
    terminalLocalStatuses.has(existing.status) ||
    inactiveStripeStatuses.has(sub.status)
  ) {
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
    .select("id, parent_user_id")
    .maybeSingle<{ id: string; parent_user_id: string | null }>();
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

    // Phase 10.5 — freeze in-flight commission rows. Past `paid` rows
    // are NEVER touched (those are the nanny's). Reclaimable on
    // resubscription via unfreezeEarningsOnResubscribe.
    try {
      const { frozen } = await freezeInFlightCommissionForSubscription(
        row.id,
        "parent_cancelled",
      );
      if (frozen > 0) {
        await logActivity(admin, {
          action_type: "commission_held",
          user_id: row.parent_user_id,
          action_details: {
            parent_subscription_id: row.id,
            frozen_count: frozen,
            reason: "parent_cancelled",
          },
        });
      }
    } catch (err) {
      console.error("[stripe-webhook] freeze on cancel failed", err);
    }
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
// account.updated — Connect Express account verification state changes
// ---------------------------------------------------------------------------

export async function handleAccountUpdated(
  admin: AdminClient,
  event: Stripe.AccountUpdatedEvent,
): Promise<void> {
  const account = event.data.object;
  // Verification is "ready for payouts" when the transfers capability
  // is active AND there are no current/past-due/disabled requirements
  // blocking. Stripe consolidates this into payouts_enabled.
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  // Find the nanny row by the connect account id.
  const { data: nanny } = await admin
    .from("nannies")
    .select("id, connect_onboarded_at, payout_application_status")
    .eq("stripe_connect_account_id", account.id)
    .maybeSingle<{
      id: string;
      connect_onboarded_at: string | null;
      payout_application_status: string | null;
    }>();
  if (!nanny) {
    console.warn(
      "[stripe-webhook] account.updated for unknown connect account",
      account.id,
    );
    return;
  }

  // Mark onboarded when first time the account passes both gates.
  // Idempotent: don't overwrite an existing onboarded timestamp.
  if (payoutsEnabled && detailsSubmitted && !nanny.connect_onboarded_at) {
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("nannies")
      .update({
        connect_onboarded_at: nowIso,
        payout_application_status: "verified",
      })
      .eq("id", nanny.id);
    if (error) {
      throw new Error(
        `nannies update (account.updated) failed: ${error.message}`,
      );
    }
    await logActivity(admin, {
      action_type: "payout_application_status_changed",
      user_id: null,
      action_details: {
        nanny_id: nanny.id,
        connect_account_id: account.id,
        new_status: "verified",
        payouts_enabled: payoutsEnabled,
      },
    });
    return;
  }

  // Previously-onboarded account just lost payouts_enabled — Stripe has
  // restricted the account (e.g. dispute, missing info, sanctions hit).
  // Flip our payout_application_status to "restricted" so the admin
  // dashboard surfaces the nanny + we stop scheduling new payouts to
  // a frozen Stripe account. Leave connect_onboarded_at populated —
  // it's the historical marker, not the live capability flag.
  if (
    !payoutsEnabled &&
    nanny.connect_onboarded_at &&
    nanny.payout_application_status !== "restricted"
  ) {
    const { error } = await admin
      .from("nannies")
      .update({ payout_application_status: "restricted" })
      .eq("id", nanny.id);
    if (error) {
      throw new Error(
        `nannies update (account.updated → restricted) failed: ${error.message}`,
      );
    }
    await logActivity(admin, {
      action_type: "payout_application_status_changed",
      user_id: null,
      action_details: {
        nanny_id: nanny.id,
        connect_account_id: account.id,
        new_status: "restricted",
        payouts_enabled: payoutsEnabled,
        requirements_currently_due: account.requirements?.currently_due ?? null,
      },
    });
    return;
  }

  // Stripe re-enables a previously-restricted account (admin or nanny
  // resolved the outstanding requirements). Restore "verified" so we
  // resume normal payout flow.
  if (
    payoutsEnabled &&
    detailsSubmitted &&
    nanny.connect_onboarded_at &&
    nanny.payout_application_status === "restricted"
  ) {
    const { error } = await admin
      .from("nannies")
      .update({ payout_application_status: "verified" })
      .eq("id", nanny.id);
    if (error) {
      throw new Error(
        `nannies update (account.updated → re-verified) failed: ${error.message}`,
      );
    }
    await logActivity(admin, {
      action_type: "payout_application_status_changed",
      user_id: null,
      action_details: {
        nanny_id: nanny.id,
        connect_account_id: account.id,
        new_status: "verified",
        payouts_enabled: payoutsEnabled,
        reason: "restored_from_restricted",
      },
    });
    return;
  }

  // For ongoing capability changes that don't flip the actionable
  // state (e.g. Stripe asks for more info but payouts still enabled),
  // surface as an activity log for admin visibility.
  await logActivity(admin, {
    action_type: "nanny_account_updated",
    user_id: null,
    action_details: {
      nanny_id: nanny.id,
      connect_account_id: account.id,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      requirements_currently_due: account.requirements?.currently_due ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// account.application.deauthorized — nanny revoked Connect access
// ---------------------------------------------------------------------------

export async function handleAccountDeauthorized(
  admin: AdminClient,
  event: Stripe.AccountApplicationDeauthorizedEvent,
): Promise<void> {
  // Account id is on event.account when the application is the
  // platform's own Connect app (which it is for our Express flow).
  const accountId = event.account ?? null;
  if (!accountId) {
    console.warn(
      "[stripe-webhook] account.application.deauthorized no account",
    );
    return;
  }

  const { data: nanny } = await admin
    .from("nannies")
    .select("id")
    .eq("stripe_connect_account_id", accountId)
    .maybeSingle<{ id: string }>();
  if (!nanny) return;

  const { error } = await admin
    .from("nannies")
    .update({
      payout_application_status: "not_applied",
      connect_onboarded_at: null,
    })
    .eq("id", nanny.id);
  if (error) {
    throw new Error(
      `nannies update (account.deauthorized) failed: ${error.message}`,
    );
  }

  await logActivity(admin, {
    action_type: "payout_application_status_changed",
    user_id: null,
    action_details: {
      nanny_id: nanny.id,
      connect_account_id: accountId,
      new_status: "deauthorized",
    },
  });
}

// ---------------------------------------------------------------------------
// capability.updated — granular Connect capability changes
// ---------------------------------------------------------------------------

export async function handleCapabilityUpdated(
  admin: AdminClient,
  event: Stripe.CapabilityUpdatedEvent,
): Promise<void> {
  const cap = event.data.object;
  const accountId = stringOrNull(cap.account);
  if (!accountId) return;

  // Audit-only — actionable state flips are picked up by account.updated.
  await logActivity(admin, {
    action_type: "nanny_account_updated",
    user_id: null,
    action_details: {
      connect_account_id: accountId,
      capability: cap.id,
      status: cap.status,
    },
  });
}

// ---------------------------------------------------------------------------
// payout.created / payout.paid / payout.failed — Stripe transferring to bank
// ---------------------------------------------------------------------------

export async function handlePayoutCreated(
  admin: AdminClient,
  event: Stripe.PayoutCreatedEvent,
): Promise<void> {
  // Audit-only event — actual state transition happens in handlePayoutPaid.
  // The action_type was `payout_paid` previously, which mis-labelled the
  // forensic log + would have mis-counted payout success in any future
  // dashboard. Correct it to `payout_created`.
  await logActivity(admin, {
    action_type: "payout_created",
    user_id: null,
    action_details: {
      stripe_payout_id: event.data.object.id,
      stripe_account: event.account ?? null,
      amount: event.data.object.amount,
      status: event.data.object.status,
      created_at: event.data.object.created,
    },
  });
}

export async function handlePayoutPaid(
  admin: AdminClient,
  event: Stripe.PayoutPaidEvent,
): Promise<void> {
  // Mark any matching nanny_payouts row as paid. Stripe's payout id
  // is stored on `stripe_transfer_id` in our schema.
  //
  // Throw on DB failure — Stripe will retry the webhook + the missing
  // state transition is high-stakes (nanny + admin both rely on
  // `nanny_payouts.status` to determine whether the parent's money
  // has landed). Silently logging would mark the event delivered
  // while leaving the row stuck on `processing`.
  const stripePayoutId = event.data.object.id;
  const arrival = event.data.object.arrival_date * 1000;
  const arrivalIso = new Date(arrival).toISOString();

  const { error } = await admin
    .from("nanny_payouts")
    .update({
      status: "paid",
      paid_at: arrivalIso,
    })
    .eq("stripe_transfer_id", stripePayoutId);
  if (error) {
    throw new Error(
      `nanny_payouts update (payout.paid) failed: ${error.message}`,
    );
  }

  await logActivity(admin, {
    action_type: "payout_paid",
    user_id: null,
    action_details: {
      stripe_payout_id: stripePayoutId,
      stripe_account: event.account ?? null,
      arrival_date: arrivalIso,
    },
  });
}

export async function handlePayoutFailed(
  admin: AdminClient,
  event: Stripe.PayoutFailedEvent,
): Promise<void> {
  // Throw on DB failure — see handlePayoutPaid rationale. A failed
  // payout that isn't reflected in our row would leave the nanny seeing
  // "scheduled" while Stripe shows "failed", which is exactly the
  // dashboard divergence we can't ship.
  const stripePayoutId = event.data.object.id;
  const failureMessage =
    event.data.object.failure_message ?? "(no message provided)";

  const { error } = await admin
    .from("nanny_payouts")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: failureMessage,
    })
    .eq("stripe_transfer_id", stripePayoutId);
  if (error) {
    throw new Error(
      `nanny_payouts update (payout.failed) failed: ${error.message}`,
    );
  }

  await logActivity(admin, {
    action_type: "payout_failed",
    user_id: null,
    action_details: {
      stripe_payout_id: stripePayoutId,
      stripe_account: event.account ?? null,
      failure_message: failureMessage,
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
 *
 * SDK-gap note: this project pins `stripe@^17.x` against API version
 * `2024-09-30.acacia`. On that version, the Subscription type's
 * `current_period_end` was moved to per-item, so the top-level cast
 * is for legacy-shape compatibility (older raw events). Replace with
 * direct property access once the SDK + API version are advanced
 * past the migration.
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
 * Throws on DB error — this runs in the upfront checkout completion
 * handler, where a misset `paid_period_ends_at` directly determines
 * how long the parent retains paid access for a real-money
 * subscription. Better to let Stripe retry the webhook than to silently
 * fall back to "now + 5 years" and lock in the wrong period.
 *
 * Falls back to "now + 5 years" only when the parent has NO linked
 * children — defensive; the upfront flow shouldn't be reachable
 * without at least one child connected.
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
    throw new Error(
      `child_client lookup (earliest fifth birthday) failed: ${error.message}`,
    );
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
