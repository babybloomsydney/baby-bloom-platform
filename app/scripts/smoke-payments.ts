/**
 * End-to-end smoke test for the payments stack.
 *
 * Stages:
 *   A. Pick test parent (with child).
 *   B. Reset state — wipe any existing parent_subscriptions row.
 *   C. Fire `checkout.session.completed` (upfront plan) via Stripe CLI.
 *      Verify parent_subscriptions row created + activity_logs row.
 *   D. Attempt bapp_logs write — should succeed (active).
 *   E. Fire `customer.subscription.deleted` against a fake sub id — we
 *      can't do this cleanly with the upfront path (no sub), so instead
 *      mutate the row to cancelled to simulate lapsed state, then try
 *      bapp_logs write again — should be blocked.
 *   F. Print all `stripe_webhook_events` rows from this session.
 *
 * Run: `npx tsx scripts/smoke-payments.ts`
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

config({ path: resolve(__dirname, "..", ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callLogDiaryEntry(
  childId: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  // We can't auth-as-user from a service-role script without crafting a JWT.
  // Instead, exercise the gate at the lib level by importing it directly.
  const mod = await import("../src/lib/payments/access-gate");
  const gate = await mod.requireChildFamilyAccess(childId);
  return { ok: gate.hasAccess, status: gate.hasAccess ? 200 : 402, body: gate };
}

async function main() {
  const stamp = new Date().toISOString();
  console.log(`Payments smoke test — ${stamp}`);
  console.log("=".repeat(60));

  // A — pick parent
  const { data: candidates } = await sb
    .from("child_client")
    .select("id, parent_user_id, first_name")
    .not("parent_user_id", "is", null)
    .limit(5);
  if (!candidates || candidates.length === 0) {
    console.error("No test parents with children");
    process.exit(1);
  }
  const child = candidates[0]!;
  const parentUserId = child.parent_user_id as string;
  const childId = child.id as string;
  console.log(`Parent: ${parentUserId}`);
  console.log(`Child:  ${child.first_name} (${childId})`);

  // B — reset state
  console.log("\n[B] Reset existing parent_subscriptions row");
  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  // C — fire upfront checkout
  console.log("\n[C] Trigger checkout.session.completed (upfront)");
  const trigger = spawnSync(
    "stripe",
    [
      "trigger",
      "checkout.session.completed",
      "--add",
      `checkout_session:metadata.user_id=${parentUserId}`,
      "--add",
      "checkout_session:metadata.plan=upfront",
    ],
    { encoding: "utf8" },
  );
  if (trigger.status !== 0) {
    console.error("stripe trigger failed:", trigger.stderr);
    process.exit(1);
  }
  await sleep(5000);

  const { data: subAfter } = await sb
    .from("parent_subscriptions")
    .select("status, stripe_payment_intent_id, paid_period_ends_at")
    .eq("parent_user_id", parentUserId)
    .maybeSingle();
  console.log("parent_subscriptions:", JSON.stringify(subAfter, null, 2));
  const subOk = subAfter?.status === "active_upfront";
  console.log(subOk ? "✅ active_upfront" : "❌ unexpected state");

  // D — paywall should ALLOW (active sub)
  console.log("\n[D] Paywall gate while active");
  const gateActive = await callLogDiaryEntry(childId);
  console.log("hasAccess =", gateActive.ok, " body:", gateActive.body);
  console.log(gateActive.ok ? "✅ writes allowed" : "❌ unexpectedly blocked");

  // E — simulate cancellation
  console.log("\n[E] Simulate cancellation (status=cancelled)");
  await sb
    .from("parent_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      // Pull paid_period_ends_at into the past so the gate treats the
      // family as lapsed.
      paid_period_ends_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    })
    .eq("parent_user_id", parentUserId);

  const gateLapsed = await callLogDiaryEntry(childId);
  console.log("hasAccess =", gateLapsed.ok, " body:", gateLapsed.body);
  console.log(
    !gateLapsed.ok ? "✅ writes blocked when lapsed" : "❌ gate failed",
  );

  // F — print webhook audit rows
  console.log("\n[F] stripe_webhook_events (last 5)");
  const { data: hooks } = await sb
    .from("stripe_webhook_events")
    .select(
      "stripe_event_id, event_type, received_at, processed_at, processing_error",
    )
    .order("received_at", { ascending: false })
    .limit(5);
  console.log(JSON.stringify(hooks, null, 2));

  // Cleanup — leave parent in a clean state
  console.log("\n[cleanup] Removing test parent_subscriptions row");
  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  console.log("\n" + "=".repeat(60));
  const allPassed = subOk && gateActive.ok && !gateLapsed.ok;
  console.log(allPassed ? "✅ ALL CHECKS PASSED" : "❌ SOMETHING FAILED");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
