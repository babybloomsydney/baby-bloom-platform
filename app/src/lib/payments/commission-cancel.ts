/**
 * Commission cancel — sets in-flight nanny_payouts rows to `cancelled`
 * (terminal) when a parent cancels or refunds.
 *
 * T-018 simplification of T-016's freeze/unfreeze model:
 * - Cancel = terminal status; the row is dead history.
 * - Resubscribe = new commission row inserted by handleInvoiceSucceeded
 *   when the new parent payment lands. No row resurrection.
 *
 * Idempotent with the DB trigger
 * `trg_cancel_inflight_commission_on_terminal_status`. App-level call
 * exists for forensics parity (commission_cancelled activity log) and
 * for environments where the trigger isn't yet applied; in normal
 * operation the trigger runs first and this call updates zero rows.
 *
 * Spec: system/APP/PAYMENTS/PAYOUTS/04-code-layer.md §5.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type CancelReason = "parent_cancelled" | "parent_refunded";

export interface CancelResult {
  cancelled: number;
}

/**
 * Flips pending + held nanny_payouts rows for the given subscription to
 * `cancelled`. `paid`/`sending`/`sent` rows are NEVER clawed back —
 * those represent already-delivered or in-flight Stripe transfers.
 *
 * Called from:
 * - `customer.subscription.deleted` webhook handler (parent cancelled)
 * - `cancelSubscription` server action (parent self-serve cancel)
 * - `charge.refunded` webhook handler (refund approved)
 */
export async function cancelInFlightCommission(
  parentSubscriptionId: string,
  reason: CancelReason,
): Promise<CancelResult> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("nanny_payouts")
    .update({
      status: "cancelled",
      failure_reason: reason,
    })
    .eq("parent_subscription_id", parentSubscriptionId)
    .in("status", ["pending", "held"])
    .select("id");

  if (error) {
    console.error("[cancelInFlightCommission] update failed", error);
    throw new Error(`cancelInFlight failed: ${error.message}`);
  }

  return { cancelled: data?.length ?? 0 };
}
