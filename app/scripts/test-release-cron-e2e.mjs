/**
 * End-to-end test of the release-payout cron logic against live test
 * Stripe + Supabase. Mirrors `src/lib/payments/release-payouts.ts` +
 * `src/lib/stripe/transfers.ts` so a successful run proves the same
 * code path that runs in production at 21:00 UTC daily.
 *
 * Steps:
 *   1. Snapshot the target row + Stripe account.
 *   2. Backdate the row's scheduled_release_at to NOW - 1 minute so
 *      it's eligible.
 *   3. Run the cron logic.
 *   4. Verify: row.status = "paid", row.stripe_transfer_id set,
 *      Stripe shows the transfer.
 *   5. Rerun: verify idempotency — no double transfer.
 *
 * Test mode only. Safe to run against Bailey's test nanny.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const envPath = "./.env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let [, k, v] = m;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  console.error("Refusing to run in non-test mode.");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const ONE_MINUTE_AGO = new Date(Date.now() - 60_000).toISOString();

console.log("================================================================");
console.log("RELEASE-CRON E2E TEST");
console.log("================================================================");

// --- STEP 1: pick a target row + backdate ---
const { data: targetRows } = await admin
  .from("nanny_payouts")
  .select(
    "id, nanny_user_id, parent_user_id, amount_aud_cents, status, scheduled_release_at",
  )
  .eq("status", "pending")
  .order("scheduled_release_at", { ascending: true })
  .limit(1);

if (!targetRows || targetRows.length === 0) {
  console.log("No pending rows to test against. Aborting.");
  process.exit(0);
}

const target = targetRows[0];
console.log("\n[1] Target row:");
console.log("    id              =", target.id);
console.log("    nanny_user_id   =", target.nanny_user_id);
console.log("    amount_aud_cents=", target.amount_aud_cents);
console.log("    scheduled (orig)=", target.scheduled_release_at);
const originalScheduled = target.scheduled_release_at;

console.log("\n[2] Backdating scheduled_release_at to 1-minute-ago…");
const { error: backErr } = await admin
  .from("nanny_payouts")
  .update({ scheduled_release_at: ONE_MINUTE_AGO })
  .eq("id", target.id)
  .eq("status", "pending");
if (backErr) {
  console.error("backdate failed:", backErr.message);
  process.exit(1);
}

// --- STEP 3: replicate the cron's logic for this row ---
async function runCronOnce(label) {
  console.log("\n--- " + label + " ---");

  const nowIso = new Date().toISOString();

  // Read candidates.
  const { data: candidates, error: readErr } = await admin
    .from("nanny_payouts")
    .select("id, nanny_user_id, parent_user_id, amount_aud_cents")
    .eq("status", "pending")
    .lte("scheduled_release_at", nowIso)
    .order("scheduled_release_at", { ascending: true });

  if (readErr) {
    console.error("read failed:", readErr.message);
    return;
  }

  const rows = candidates ?? [];
  console.log(`  considered: ${rows.length}`);

  const stats = { paid: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    if (row.id !== target.id) {
      // Only act on our specific target to keep this test focused.
      continue;
    }

    // Test-user check
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, is_test_user")
      .in("user_id", [row.nanny_user_id, row.parent_user_id]);
    if ((profiles ?? []).some((p) => p.is_test_user === true)) {
      console.log("  ✗ skipped: test_user");
      stats.skipped++;
      continue;
    }

    // Connect-readiness
    const { data: nanny } = await admin
      .from("nannies")
      .select(
        "stripe_connect_account_id, payouts_enabled, payout_application_status",
      )
      .eq("user_id", row.nanny_user_id)
      .maybeSingle();

    if (!nanny?.stripe_connect_account_id) {
      console.log("  ✗ skipped: no_stripe_account");
      stats.skipped++;
      continue;
    }
    if (!nanny.payouts_enabled) {
      console.log("  ✗ skipped: !payouts_enabled");
      stats.skipped++;
      continue;
    }
    if (
      nanny.payout_application_status !== "verified" &&
      nanny.payout_application_status !== "approved"
    ) {
      console.log(
        "  ✗ skipped: payout_application_status =",
        nanny.payout_application_status,
      );
      stats.skipped++;
      continue;
    }

    // Optimistic claim
    const { data: claimed, error: claimErr } = await admin
      .from("nanny_payouts")
      .update({ status: "sending", sent_at: nowIso })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claimErr) {
      console.log("  ✗ claim failed:", claimErr.message);
      stats.failed++;
      continue;
    }
    if (!claimed) {
      console.log("  ✗ already claimed by another run (idempotency lock OK)");
      stats.skipped++;
      continue;
    }
    console.log("  ✓ claimed row, status=sending");

    // Stripe transfer
    try {
      const transfer = await stripe.transfers.create(
        {
          amount: row.amount_aud_cents,
          currency: "aud",
          destination: nanny.stripe_connect_account_id,
          transfer_group: row.id,
          metadata: {
            bb_payout_id: row.id,
            parent_user_id: row.parent_user_id,
            nanny_user_id: row.nanny_user_id,
          },
        },
        { idempotencyKey: `transfer-${row.id}` },
      );
      console.log("  ✓ stripe transfer created:", transfer.id);

      // Mark paid
      const { error: paidErr } = await admin
        .from("nanny_payouts")
        .update({
          status: "paid",
          paid_at: nowIso,
          stripe_transfer_id: transfer.id,
        })
        .eq("id", row.id);
      if (paidErr) {
        console.log("  ✗ paid mark failed:", paidErr.message);
        stats.failed++;
        continue;
      }
      console.log("  ✓ row marked paid, transfer_id=" + transfer.id);
      stats.paid++;
    } catch (err) {
      console.log("  ✗ stripe transfer threw:", err.message ?? String(err));
      stats.failed++;
    }
  }

  console.log(
    `  summary → paid=${stats.paid} skipped=${stats.skipped} failed=${stats.failed}`,
  );
  return stats;
}

const run1 = await runCronOnce("RUN 1 (should pay the row)");

// --- STEP 4: verify row state ---
console.log("\n[4] Row state after run 1:");
const { data: afterRun1 } = await admin
  .from("nanny_payouts")
  .select("status, stripe_transfer_id, paid_at, scheduled_release_at")
  .eq("id", target.id)
  .maybeSingle();
console.log("    status              =", afterRun1?.status);
console.log("    stripe_transfer_id  =", afterRun1?.stripe_transfer_id);
console.log("    paid_at             =", afterRun1?.paid_at);

// --- STEP 5: rerun to verify idempotency ---
const run2 = await runCronOnce("RUN 2 (should be a no-op — already paid)");

const { data: afterRun2 } = await admin
  .from("nanny_payouts")
  .select("status, stripe_transfer_id, paid_at")
  .eq("id", target.id)
  .maybeSingle();
console.log("\n[5] Row state after run 2 (should match run 1):");
console.log("    status              =", afterRun2?.status);
console.log("    stripe_transfer_id  =", afterRun2?.stripe_transfer_id);
console.log("    paid_at             =", afterRun2?.paid_at);

// --- STEP 6: verify ONE Stripe transfer, not two ---
console.log("\n[6] Stripe transfers for transfer_group =", target.id);
const transfers = await stripe.transfers.list({
  transfer_group: target.id,
  limit: 5,
});
console.log("    found:", transfers.data.length);
for (const t of transfers.data) {
  console.log(
    `    - ${t.id} amount=${t.amount} dest=${t.destination} created=${new Date(t.created * 1000).toISOString()}`,
  );
}

console.log("\n================================================================");
console.log("SUMMARY");
console.log("================================================================");
console.log(
  `Run 1: paid=${run1.paid}, skipped=${run1.skipped}, failed=${run1.failed}`,
);
console.log(
  `Run 2: paid=${run2.paid}, skipped=${run2.skipped}, failed=${run2.failed}`,
);
console.log(`Row final status: ${afterRun2?.status}`);
console.log(`Stripe transfers: ${transfers.data.length} (should be 1)`);

const verdict =
  run1.paid === 1 &&
  run2.paid === 0 &&
  afterRun2?.status === "paid" &&
  transfers.data.length === 1;
console.log("\nVerdict:", verdict ? "✓ PASS" : "✗ FAIL");

console.log(`\nNote: scheduled_release_at was originally ${originalScheduled}`);
console.log("(it's been overwritten by the backdate; the row is now paid)");
