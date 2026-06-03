/**
 * Commission scheduler — DB layer that wraps the pure commission engine.
 *
 * Loads `parent_subscriptions`, looks up the connected nanny via
 * `child_client`, applies the test-user safeguard, and inserts the
 * `nanny_payouts` row.
 *
 * Spec: `system/APP/PAYMENTS/06-commission-system.md` §2.
 *
 * Called from:
 * - `checkout.session.completed` webhook handler (when parent first subscribes
 *   — schedules trial-period earnings).
 * - End-of-cycle daily cron (each subsequent cycle).
 * - `payment_intent.succeeded` for upfront (3 cycles up front, one at a time).
 *
 * NOT wired into handlers.ts yet — that's a separate sub-task. The
 * function is callable + tested; integration into webhooks pending.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateCommissionCents,
  calculateScheduledReleaseAt,
  calculateCommissionPeriod,
  type CommissionPlan,
} from "./commission-engine";

export interface ScheduleCommissionInput {
  /** parent_subscriptions.id (UUID). */
  parentSubscriptionId: string;
  /** Which cycle this row covers (1-indexed). For monthly always 1.
   *  For upfront 1 / 2 / 3. */
  cycleIndex: 1 | 2 | 3;
}

export type ScheduleCommissionResult =
  | {
      ok: true;
      payoutId: string;
      amountCents: number;
      scheduledReleaseAt: string;
      initialStatus: "pending" | "held";
    }
  | {
      ok: false;
      reason:
        | "subscription_not_found"
        | "no_connected_nanny"
        | "test_user_bypass"
        | "duplicate_period"
        | "db_error";
      detail?: string;
    };

/**
 * Schedule a `nanny_payouts` row for the given subscription + trigger.
 *
 * Idempotent — the unique index on `(parent_subscription_id, period_start)`
 * prevents duplicate rows from retried webhooks. Returns `{ok: false,
 * reason: 'duplicate_period'}` cleanly when a row already exists.
 */
export async function scheduleCommissionFor(
  input: ScheduleCommissionInput,
): Promise<ScheduleCommissionResult> {
  const admin = createAdminClient();

  // Load the subscription.
  const { data: sub, error: subErr } = await admin
    .from("parent_subscriptions")
    .select(
      "id, parent_user_id, status, trial_started_at, trial_ends_at, paid_period_starts_at, paid_period_ends_at, stripe_subscription_id, stripe_payment_intent_id",
    )
    .eq("id", input.parentSubscriptionId)
    .maybeSingle<{
      id: string;
      parent_user_id: string;
      status: string;
      trial_started_at: string | null;
      trial_ends_at: string | null;
      paid_period_starts_at: string | null;
      paid_period_ends_at: string | null;
      stripe_subscription_id: string | null;
      stripe_payment_intent_id: string | null;
    }>();

  if (subErr) {
    console.error("[scheduleCommissionFor] sub read failed", subErr);
    return { ok: false, reason: "db_error", detail: subErr.message };
  }
  if (!sub) {
    return { ok: false, reason: "subscription_not_found" };
  }

  // Determine plan from the Stripe linkage. Monthly has subscription_id,
  // upfront has payment_intent_id (per migration shape).
  const plan: CommissionPlan = sub.stripe_subscription_id
    ? "monthly"
    : "upfront";

  // Find the connected nanny via child_client (single nanny per parent invariant).
  const { data: childRows, error: childErr } = await admin
    .from("child_client")
    .select("id, nanny_user_id")
    .eq("parent_user_id", sub.parent_user_id)
    .not("nanny_user_id", "is", null)
    .limit(1);

  if (childErr) {
    console.error("[scheduleCommissionFor] child read failed", childErr);
    return { ok: false, reason: "db_error", detail: childErr.message };
  }
  const nannyUserId = childRows?.[0]?.nanny_user_id;
  if (!nannyUserId) {
    // Parent paid but no nanny is connected yet → no commission row.
    // When a nanny later connects, the next cycle's scheduleCommissionFor
    // will find them. The trial-period earnings are forfeit (no one earned
    // them).
    return { ok: false, reason: "no_connected_nanny" };
  }

  // Test-user bypass — either party flagged → no payout row at all.
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, is_test_user")
    .in("user_id", [sub.parent_user_id, nannyUserId]);
  const flaggedAny = (profiles ?? []).some((p) => p.is_test_user === true);
  if (flaggedAny) {
    return { ok: false, reason: "test_user_bypass" };
  }

  // Compute amounts + dates via pure engine.
  let amountCents: number;
  try {
    amountCents = calculateCommissionCents({
      plan,
      cycleIndex: input.cycleIndex,
    });
  } catch (err: unknown) {
    return {
      ok: false,
      reason: "db_error",
      detail: err instanceof Error ? err.message : "engine error",
    };
  }

  // Payment-landed anchor (Bailey 2026-05-13 schedule lock-in):
  //   - Monthly: anchor = paid_period_starts_at (this cycle's payment).
  //   - Upfront: anchor = paid_period_starts_at (the single upfront
  //     payment), cycleIndex 1/2/3 then dictates which release window.
  // Falls back to "now" when paid_period_starts_at is missing (should
  // only happen pre-payment; rare).
  const paymentLandedAt = sub.paid_period_starts_at
    ? new Date(sub.paid_period_starts_at)
    : new Date();
  const scheduledRelease = calculateScheduledReleaseAt({
    plan,
    paymentLandedAt,
    cycleIndex: input.cycleIndex,
  });
  const period = calculateCommissionPeriod({
    plan,
    paymentLandedAt,
    cycleIndex: input.cycleIndex,
  });
  // H2 (2026-05-13): for monthly, prefer Stripe's authoritative
  // `paid_period_ends_at` over the engine's synthetic +30d. Months
  // aren't 30 days, and renewals shift the boundary — using Stripe's
  // value keeps reconciliation against Stripe invoices clean.
  // Upfront has no Stripe cycle; the engine's bucket calculation is
  // the source of truth there.
  const periodEndIsoDate =
    plan === "monthly" && sub.paid_period_ends_at
      ? sub.paid_period_ends_at.slice(0, 10)
      : period.periodEnd.toISOString().slice(0, 10);

  // T-018 — Determine initial status: `pending` if nanny is verified
  // AND payouts_enabled, else `held`.
  //
  // Previously the gate compared against `"approved"`, but no code path
  // ever writes that value — `handleAccountUpdated` (the Stripe Connect
  // onboarding webhook) sets `"verified"`. The mismatch meant ALL
  // commission rows were stuck at `'held'` and the release cron never
  // saw them. Lock 4 fix: align the gate with the value actually
  // written so commissions reach `pending` and become eligible for the
  // release-payouts cron. Permissive match accepts both `"verified"`
  // (current) and `"approved"` (defensive forward-compat).
  const { data: nannyRow } = await admin
    .from("nannies")
    .select("payout_application_status, payouts_enabled")
    .eq("user_id", nannyUserId)
    .maybeSingle<{
      payout_application_status: string;
      payouts_enabled: boolean | null;
    }>();
  const initialStatus: "pending" | "held" =
    (nannyRow?.payout_application_status === "verified" ||
      nannyRow?.payout_application_status === "approved") &&
    nannyRow?.payouts_enabled === true
      ? "pending"
      : "held";

  // Insert. UNIQUE index on (parent_subscription_id, period_start)
  // surfaces duplicates as 23505 — treat as benign.
  const { data: insertResult, error: insertErr } = await admin
    .from("nanny_payouts")
    .insert({
      parent_subscription_id: sub.id,
      parent_user_id: sub.parent_user_id,
      nanny_user_id: nannyUserId,
      period_start: period.periodStart.toISOString().slice(0, 10), // DATE column
      period_end: periodEndIsoDate,
      amount_aud_cents: amountCents,
      commission_model_version: "v1_flat",
      status: initialStatus,
      scheduled_release_at: scheduledRelease.toISOString(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Duplicate — already scheduled. Idempotent retry path.
      return {
        ok: false,
        reason: "duplicate_period",
        detail: insertErr.message,
      };
    }
    console.error("[scheduleCommissionFor] insert failed", insertErr);
    return { ok: false, reason: "db_error", detail: insertErr.message };
  }
  if (!insertResult) {
    return { ok: false, reason: "db_error", detail: "no row returned" };
  }

  // Audit log. The payout row is already committed at this point —
  // a logging failure must NOT poison the success path, but it must
  // also not silently disappear. Log loudly on error so the admin
  // audit trail's gaps are visible during reconciliation.
  const { error: logErr } = await admin.from("activity_logs").insert({
    user_id: sub.parent_user_id,
    action_type: "commission_scheduled",
    action_details: {
      payout_id: insertResult.id,
      parent_subscription_id: sub.id,
      nanny_user_id: nannyUserId,
      plan,
      cycle_index: input.cycleIndex,
      amount_aud_cents: amountCents,
      initial_status: initialStatus,
      scheduled_release_at: scheduledRelease.toISOString(),
    },
  });
  if (logErr) {
    console.error("[scheduleCommissionFor] activity_log insert failed", {
      payoutId: insertResult.id,
      error: logErr,
    });
  }

  return {
    ok: true,
    payoutId: insertResult.id,
    amountCents,
    scheduledReleaseAt: scheduledRelease.toISOString(),
    initialStatus,
  };
}
