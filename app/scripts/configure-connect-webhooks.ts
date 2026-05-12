/**
 * Adds the Stripe Connect events we need (S13 + payouts) to the
 * existing webhook endpoint.
 *
 * Required events:
 *   - account.updated
 *   - account.application.deauthorized
 *   - capability.updated
 *   - payout.created
 *   - payout.paid
 *   - payout.failed
 *
 * Idempotent: reads the current endpoint config, merges in any
 * missing events, and updates. Safe to re-run.
 *
 * Run: `npx tsx scripts/configure-connect-webhooks.ts`
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import Stripe from "stripe";

config({ path: resolve(__dirname, "..", ".env.local") });

const key = process.env.STRIPE_SECRET_KEY;
const endpointId = process.env.STRIPE_WEBHOOK_ENDPOINT_ID;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
if (!endpointId) {
  console.error("Missing STRIPE_WEBHOOK_ENDPOINT_ID in .env.local");
  process.exit(1);
}

const stripe = new Stripe(key);

const REQUIRED_EVENTS = [
  "account.updated",
  "account.application.deauthorized",
  "capability.updated",
  "payout.created",
  "payout.paid",
  "payout.failed",
];

async function main() {
  // endpointId is validated above; TS doesn't narrow across process.exit.
  const id = endpointId as string;
  console.log(`Configuring Connect events on webhook ${id}`);
  console.log("=".repeat(60));

  const current = await stripe.webhookEndpoints.retrieve(id);
  const currentEvents = current.enabled_events ?? [];
  console.log(`Currently subscribed to ${currentEvents.length} events`);

  const missing = REQUIRED_EVENTS.filter((e) => !currentEvents.includes(e));
  if (missing.length === 0) {
    console.log("✅ All Connect events already configured. No change needed.");
    return;
  }
  console.log(`Adding ${missing.length} missing events:`, missing);

  const merged = Array.from(new Set([...currentEvents, ...REQUIRED_EVENTS]));
  const updated = await stripe.webhookEndpoints.update(id, {
    enabled_events: merged as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
  });

  console.log("");
  console.log(
    `✅ Updated. Endpoint now subscribes to ${updated.enabled_events.length} events.`,
  );
  for (const e of REQUIRED_EVENTS) {
    const ok = updated.enabled_events.includes(e);
    console.log(`  ${ok ? "✓" : "✗"} ${e}`);
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
