/**
 * End-to-end smoke test for the MONTHLY subscription path.
 *
 * Why this exists separately from `smoke-payments.ts`:
 *   The default `stripe trigger checkout.session.completed` fixture
 *   creates a one-time payment session (mode=payment), which only
 *   exercises our `upfront` branch. The `monthly` branch requires a
 *   subscription-mode session linked to a real Stripe subscription,
 *   because the handler calls `stripe.subscriptions.retrieve()` on it.
 *
 * Approach:
 *   1. Create a real test customer + attach a default payment method.
 *   2. Create a real subscription (using STRIPE_PRICE_MONTHLY_ID).
 *   3. Build a synthetic checkout.session.completed event payload that
 *      references the real subscription id + carries our metadata.
 *   4. Sign the payload with our webhook secret (Stripe SDK helper) and
 *      POST it to localhost:3000/api/webhooks/stripe.
 *   5. Verify parent_subscriptions row upserted to active_monthly with
 *      the real stripe_subscription_id + paid_period_ends_at from the
 *      live subscription.
 *
 * Run: `npx tsx scripts/smoke-payments-monthly.ts`
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

config({ path: resolve(__dirname, "..", ".env.local") });

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const monthlyPriceId = process.env.STRIPE_PRICE_MONTHLY_ID;
if (!sbUrl || !sbKey || !stripeKey || !webhookSecret || !monthlyPriceId) {
  console.error("Missing required env");
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);
const stripe = new Stripe(stripeKey);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Payments smoke test — MONTHLY — ${new Date().toISOString()}`);
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
  console.log(`Parent: ${parentUserId}`);
  console.log(`Child:  ${child.first_name}`);

  // B — reset DB state
  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  // C — create live Stripe customer + subscription
  console.log("\n[C] Creating real Stripe customer + subscription");
  const customer = await stripe.customers.create({
    description: `Smoke test ${Date.now()}`,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  console.log("customer:", customer.id);

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: monthlyPriceId! }],
    metadata: { user_id: parentUserId, plan: "monthly" },
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
  });
  console.log("subscription:", sub.id, "status=", sub.status);

  // The handler expects a paid subscription. Stripe test cards finalize
  // automatically when the customer has a default payment method, but
  // `payment_behavior=default_incomplete` requires a payment intent
  // confirmation. We confirm it via tok_visa to drive it to `active`.
  const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;
  const piRef = (latestInvoice as unknown as { payment_intent?: unknown })
    ?.payment_intent;
  const piId =
    typeof piRef === "string"
      ? piRef
      : (piRef as { id?: string } | undefined)?.id;
  if (piId) {
    await stripe.paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
    });
  }
  const sub2 = await stripe.subscriptions.retrieve(sub.id);
  console.log("subscription after confirm:", sub2.status);

  // D — build + sign + POST a synthetic checkout.session.completed
  console.log("\n[D] Synthesising checkout.session.completed event");
  const sessionId = `cs_test_smoke_${Date.now()}`;
  const eventPayload = {
    id: `evt_test_smoke_${Date.now()}`,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        mode: "subscription",
        customer: customer.id,
        subscription: sub.id,
        payment_intent: null,
        metadata: { user_id: parentUserId, plan: "monthly" },
        status: "complete",
        payment_status: "paid",
      },
    },
  };

  const payload = JSON.stringify(eventPayload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret!,
  });

  const res = await fetch("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": header,
    },
    body: payload,
  });
  console.log("webhook response:", res.status, await res.text());

  await sleep(2500);

  // E — verify
  const { data: subRow } = await sb
    .from("parent_subscriptions")
    .select(
      "status, stripe_subscription_id, stripe_customer_id, paid_period_ends_at, subscription_cycle",
    )
    .eq("parent_user_id", parentUserId)
    .maybeSingle();
  console.log("\n[E] parent_subscriptions:", JSON.stringify(subRow, null, 2));

  const subOk =
    subRow?.status === "active_monthly" &&
    subRow?.stripe_subscription_id === sub.id;
  console.log(subOk ? "✅ active_monthly with correct sub id" : "❌ mismatch");

  // F — webhook audit row
  const { data: hook } = await sb
    .from("stripe_webhook_events")
    .select("stripe_event_id, event_type, processed_at, processing_error")
    .eq("stripe_event_id", eventPayload.id)
    .maybeSingle();
  console.log(
    "\n[F] stripe_webhook_events row:",
    JSON.stringify(hook, null, 2),
  );
  const hookOk = hook?.processed_at !== null && !hook?.processing_error;
  console.log(hookOk ? "✅ audit row clean" : "❌ audit problem");

  // Cleanup
  console.log("\n[cleanup] Cancelling Stripe subscription + clearing DB row");
  await stripe.subscriptions.cancel(sub.id);
  await sb
    .from("parent_subscriptions")
    .delete()
    .eq("parent_user_id", parentUserId);

  console.log("\n" + "=".repeat(60));
  console.log(subOk && hookOk ? "✅ ALL CHECKS PASSED" : "❌ SOMETHING FAILED");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
