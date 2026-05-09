/**
 * Commission freeze + unfreeze — implements Bailey's reversible-forfeit
 * model from `06-commission-system.md` "Frozen state on parent
 * cancellation" + "Reclaim on resubscribe" + Phase 10.5 build order.
 *
 * Rules:
 * - When a parent cancels OR a refund is approved → flip their
 *   pending/held nanny_payouts rows to `frozen`. Past `paid` rows are
 *   NEVER clawed back (those are the nanny's).
 * - When the same parent resubscribes → flip their `frozen` rows back
 *   to `pending` with a fresh 14-day safeguard window from the new
 *   payment.
 *
 * Idempotent — calling twice is safe (the second call hits no rows).
 */

import { createAdminClient } from "@/lib/supabase/admin";

const SAFEGUARD_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type FreezeReason = "parent_cancelled" | "parent_refunded";

export interface FreezeResult {
  frozen: number;
}

/**
 * Flips pending + held payouts for the given subscription to `frozen`.
 * Sets `frozen_at = NOW()` and `failure_reason` to the supplied trigger.
 *
 * Called from:
 * - `customer.subscription.deleted` webhook handler (parent cancelled)
 * - Refund-decision flow when an admin approves a refund
 */
export async function freezeInFlightCommissionForSubscription(
  parentSubscriptionId: string,
  reason: FreezeReason,
): Promise<FreezeResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("nanny_payouts")
    .update({
      status: "frozen",
      frozen_at: nowIso,
      failure_reason: reason,
    })
    .eq("parent_subscription_id", parentSubscriptionId)
    .in("status", ["pending", "held"])
    .select("id");

  if (error) {
    console.error(
      "[freezeInFlightCommissionForSubscription] update failed",
      error,
    );
    throw new Error(`freezeInFlight failed: ${error.message}`);
  }

  return { frozen: data?.length ?? 0 };
}

export interface UnfreezeResult {
  unfrozen: number;
}

/**
 * Flips `frozen` payouts for the given subscription back to `pending`,
 * resetting `scheduled_release_at` to NOW + 14 days (fresh safeguard
 * window from the new payment).
 *
 * Called from `checkout.session.completed` webhook handler when a
 * parent resubscribes after a previous cancellation.
 */
export async function unfreezeEarningsOnResubscribe(
  parentSubscriptionId: string,
): Promise<UnfreezeResult> {
  const admin = createAdminClient();
  const newReleaseAt = new Date(Date.now() + SAFEGUARD_WINDOW_MS).toISOString();

  const { data, error } = await admin
    .from("nanny_payouts")
    .update({
      status: "pending",
      frozen_at: null,
      failure_reason: null,
      scheduled_release_at: newReleaseAt,
    })
    .eq("parent_subscription_id", parentSubscriptionId)
    .eq("status", "frozen")
    .select("id");

  if (error) {
    console.error("[unfreezeEarningsOnResubscribe] update failed", error);
    throw new Error(`unfreezeEarnings failed: ${error.message}`);
  }

  return { unfrozen: data?.length ?? 0 };
}
