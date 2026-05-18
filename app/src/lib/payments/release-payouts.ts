/**
 * release-payouts — the executor that actually pays nannies.
 *
 * Triggered by the `/api/cron/release-payouts` cron route. Reads
 * every `nanny_payouts` row that's eligible (`status='pending'` AND
 * `scheduled_release_at <= now`), runs the per-row safety checks,
 * then calls `sendTransfer` to issue a Stripe Connect payout.
 *
 * **Why this exists** (Bailey 2026-05-14): the rest of the payment
 * pipeline schedules these rows, the UI shows them, but until now
 * NOTHING was calling `sendTransfer`. Nannies would never have been
 * paid in production. This module closes that loop.
 *
 * Idempotency: `sendTransfer` keys on the BB-side payout id, so a
 * retried run after a network blip returns the same Stripe transfer
 * rather than double-paying. The row is flipped to `sending` before
 * the Stripe call and only to `paid` after the call returns — so
 * concurrent cron runs don't both attempt the same row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StripeResult } from "@/types/payments";
import type { SendTransferInput, SendTransferOutput } from "@/lib/stripe/types";

export interface ReleasePayoutsResult {
  considered: number;
  paid: number;
  skipped_not_ready: number;
  skipped_test_user: number;
  skipped_no_account: number;
  failed: number;
  errors: ReleasePayoutError[];
}

export interface ReleasePayoutError {
  payoutId: string;
  reason: string;
}

interface DuePayoutRow {
  id: string;
  nanny_user_id: string;
  parent_user_id: string;
  amount_aud_cents: number;
}

interface NannyConnectRow {
  stripe_connect_account_id: string | null;
  payouts_enabled: boolean;
  payout_application_status: string;
}

export interface ReleasePayoutsDeps {
  // Use a loose Supabase type so tests can pass a minimal fake without
  // implementing every method. The runtime call site passes the real
  // admin client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>;
  sendTransfer: (
    input: SendTransferInput,
  ) => Promise<StripeResult<SendTransferOutput>>;
  now: Date;
}

/**
 * Execute one pass of payout release. Pure-ish — every external
 * dependency comes in via `deps` so the tests inject mocks for the
 * Supabase client and the Stripe transfer wrapper.
 */
export async function releasePayouts(
  deps: ReleasePayoutsDeps,
): Promise<ReleasePayoutsResult> {
  const { admin, now } = deps;
  const nowIso = now.toISOString();

  const result: ReleasePayoutsResult = {
    considered: 0,
    paid: 0,
    skipped_not_ready: 0,
    skipped_test_user: 0,
    skipped_no_account: 0,
    failed: 0,
    errors: [],
  };

  const { data: candidates, error: readErr } = await admin
    .from("nanny_payouts")
    .select("id, nanny_user_id, parent_user_id, amount_aud_cents")
    .eq("status", "pending")
    .lte("scheduled_release_at", nowIso)
    .order("scheduled_release_at", { ascending: true })
    .returns<DuePayoutRow[]>();

  if (readErr) {
    throw new Error(`release-payouts read failed: ${readErr.message}`);
  }

  const rows = candidates ?? [];
  result.considered = rows.length;

  for (const row of rows) {
    try {
      await releaseOnePayout(row, deps, result, nowIso);
    } catch (err) {
      // Per-row failures must not poison the whole run. Record + move
      // on so other nannies still get paid.
      const reason = err instanceof Error ? err.message : String(err);
      result.errors.push({ payoutId: row.id, reason });
      result.failed += 1;
      console.error("[release-payouts] row failed", row.id, reason);
    }
  }

  return result;
}

async function releaseOnePayout(
  row: DuePayoutRow,
  deps: ReleasePayoutsDeps,
  result: ReleasePayoutsResult,
  nowIso: string,
): Promise<void> {
  const { admin, sendTransfer } = deps;

  // Skip if either party is a test user. Test-user bypass is one of
  // the project-wide invariants (memory: test-user-mechanism).
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, is_test_user")
    .in("user_id", [row.nanny_user_id, row.parent_user_id])
    .returns<Array<{ user_id: string; is_test_user: boolean | null }>>();
  if ((profiles ?? []).some((p) => p.is_test_user === true)) {
    result.skipped_test_user += 1;
    return;
  }

  // Load nanny Connect state.
  const { data: nanny } = await admin
    .from("nannies")
    .select(
      "stripe_connect_account_id, payouts_enabled, payout_application_status",
    )
    .eq("user_id", row.nanny_user_id)
    .maybeSingle<NannyConnectRow>();

  if (!nanny) {
    result.skipped_no_account += 1;
    return;
  }
  if (!nanny.stripe_connect_account_id) {
    result.skipped_no_account += 1;
    return;
  }
  // Defence in depth — pending status writes happen against an
  // approved/verified nanny, but a connect-status downgrade could
  // race us. Skip if not currently OK to receive payouts.
  if (!nanny.payouts_enabled) {
    result.skipped_not_ready += 1;
    return;
  }
  if (
    nanny.payout_application_status !== "verified" &&
    nanny.payout_application_status !== "approved"
  ) {
    result.skipped_not_ready += 1;
    return;
  }

  // Optimistically move to `sending` so a concurrent run doesn't
  // double-attempt. The UPDATE filters `status='pending'` so if
  // another run already grabbed it, this no-op'd.
  const { data: claimed, error: claimErr } = await admin
    .from("nanny_payouts")
    .update({ status: "sending", sent_at: nowIso })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();
  if (claimErr) {
    throw new Error(`claim failed: ${claimErr.message}`);
  }
  if (!claimed) {
    // Another run beat us to it. Not an error.
    return;
  }

  const transfer = await sendTransfer({
    destinationAccountId: nanny.stripe_connect_account_id,
    amountCents: row.amount_aud_cents,
    transferId: row.id,
    metadata: {
      bb_payout_id: row.id,
      parent_user_id: row.parent_user_id,
      nanny_user_id: row.nanny_user_id,
    },
  });

  if (!transfer.success || !transfer.data) {
    const reason = transfer.success ? "no transfer data" : transfer.error;
    const { error: failErr } = await admin
      .from("nanny_payouts")
      .update({
        status: "failed",
        failed_at: nowIso,
        failure_reason: reason,
      })
      .eq("id", row.id);
    if (failErr) {
      throw new Error(
        `failed-mark write failed: ${failErr.message} (origin: ${reason})`,
      );
    }
    await admin.from("activity_logs").insert({
      user_id: row.nanny_user_id,
      action_type: "payout_failed",
      action_details: {
        nanny_payout_id: row.id,
        reason,
        amount_aud_cents: row.amount_aud_cents,
      },
    });
    result.failed += 1;
    result.errors.push({ payoutId: row.id, reason });
    return;
  }

  // Success — mark paid + log.
  const { error: paidErr } = await admin
    .from("nanny_payouts")
    .update({
      status: "paid",
      paid_at: nowIso,
      stripe_transfer_id: transfer.data.transferId,
    })
    .eq("id", row.id);
  if (paidErr) {
    // The Stripe transfer already happened — we can't reverse it.
    // Surface loudly so the admin can manually reconcile the DB row.
    throw new Error(
      `transfer succeeded but DB update failed: ${paidErr.message}` +
        ` (stripe_transfer_id=${transfer.data.transferId})`,
    );
  }

  await admin.from("activity_logs").insert({
    user_id: row.nanny_user_id,
    action_type: "payout_paid",
    action_details: {
      nanny_payout_id: row.id,
      stripe_transfer_id: transfer.data.transferId,
      amount_aud_cents: row.amount_aud_cents,
    },
  });
  result.paid += 1;
}
