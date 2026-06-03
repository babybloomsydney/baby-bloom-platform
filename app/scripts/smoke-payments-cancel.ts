/**
 * End-to-end smoke test for the cancel flow (S9) — Phase H extension.
 *
 * Stages:
 *   A. Pick a test parent (with child) + reset their subscription row
 *   B. Create a real Stripe subscription (using STRIPE_PRICE_MONTHLY_ID)
 *   C. Synthesise checkout.session.completed to mark the row active
 *   D. Call cancelSubscription server action via the Stripe API
 *      directly (the action is dynamic 'use server' — we exercise
 *      the underlying Stripe + DB steps directly here to keep this
 *      script callable from a plain Node context)
 *   E. Verify Stripe shows cancel_at_period_end=true
 *   F. Verify our parent_subscriptions row shows cancellation_reason
 *
 * Note: this script uses the same pattern as `smoke-payments-monthly.ts`
 * — direct Stripe + Supabase calls, no Next.js context. The real
 * `cancelSubscription` server action is unit-tested separately; this
 * smoke exercises the Stripe + DB integration end-to-end.
 *
 * Run: `npx tsx scripts/smoke-payments-cancel.ts`
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

config({ path: resolve(__dirname, "..", ".env.local") });

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY_ID;
if (!sbUrl || !sbKey || !stripeKey || !monthlyPriceId) {
  console.error("Missing required env");
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);
const stripe = new Stripe(stripeKey);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Cancel smoke — ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // A — pick parent + reset
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
  console.log(`Parent: ${parentUserId}`);

  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  // B — create Stripe customer + subscription
  console.log("\n[B] Create live Stripe customer + subscription");
  const customer = await stripe.customers.create({
    description: `Cancel smoke ${Date.now()}`,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: monthlyPriceId! }],
    metadata: { user_id: parentUserId, plan: "monthly" },
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });
  console.log(`subscription: ${sub.id}`);

  // C — insert active row directly (skip the webhook step since the
  //     monthly smoke already covers it; we just need the row to
  //     exercise cancel against).
  console.log("\n[C] Insert active_monthly row");
  const nowIso = new Date().toISOString();
  const periodEnd = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await sb.from("parent_subscriptions").insert({
    parent_user_id: parentUserId,
    status: "active_monthly",
    stripe_customer_id: customer.id,
    stripe_subscription_id: sub.id,
    paid_period_starts_at: nowIso,
    paid_period_ends_at: periodEnd,
    has_used_trial: true,
    subscription_cycle: 1,
  });

  // D — exercise the Stripe-side cancel-at-period-end + the DB write
  //     that cancelSubscription performs.
  console.log("\n[D] Cancel via Stripe + DB write");
  await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: true,
    metadata: { cancellation_reason: "too_expensive" },
  });
  await sb
    .from("parent_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: "too_expensive",
      cancellation_reason_text: "rent went up",
    })
    .eq("parent_user_id", parentUserId);

  await sleep(2000);

  // E — verify Stripe state
  console.log("\n[E] Stripe state");
  const refreshed = await stripe.subscriptions.retrieve(sub.id);
  console.log(`cancel_at_period_end: ${refreshed.cancel_at_period_end}`);
  console.log(
    `metadata.cancellation_reason: ${refreshed.metadata?.cancellation_reason}`,
  );

  // F — verify DB state
  console.log("\n[F] DB state");
  const { data: row } = await sb
    .from("parent_subscriptions")
    .select(
      "status, cancellation_reason, cancellation_reason_text, cancelled_at",
    )
    .eq("parent_user_id", parentUserId)
    .maybeSingle();
  console.log(JSON.stringify(row, null, 2));

  // Cleanup
  await stripe.subscriptions.cancel(sub.id).catch(() => {});
  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  const verdict =
    refreshed.cancel_at_period_end === true &&
    refreshed.metadata?.cancellation_reason === "too_expensive" &&
    row?.cancellation_reason === "too_expensive" &&
    row?.cancellation_reason_text === "rent went up";
  console.log("\n" + "=".repeat(60));
  console.log(verdict ? "✅ CANCEL SMOKE PASSED" : "❌ SOMETHING FAILED");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
