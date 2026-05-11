/**
 * Diagnostic — verifies whether Connect + Stripe Tax are activated
 * on the configured Stripe account. Read-only; no resources created.
 *
 * Run: `npx tsx scripts/check-stripe-status.ts`
 */

import Stripe from "stripe";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "..", ".env.local") });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local");
  process.exit(1);
}

const stripe = new Stripe(key);

async function main() {
  console.log("Stripe activation status check");
  console.log("=".repeat(50));

  // Account-level info.
  const account = await stripe.accounts.retrieve();
  console.log("Account country:", account.country);
  console.log("Account email:", account.email ?? "(none)");
  console.log("Charges enabled:", account.charges_enabled);
  console.log("Payouts enabled:", account.payouts_enabled);
  console.log("");

  // ── Connect ──
  console.log("CONNECT");
  console.log("-".repeat(50));
  try {
    // Listing connected accounts works only if Connect is activated.
    const connectedAccts = await stripe.accounts.list({ limit: 1 });
    console.log(
      `✅ Connect appears ACTIVATED — accounts.list() works (${connectedAccts.data.length} existing connected accounts).`,
    );
  } catch (err) {
    const e = err as { message?: string; type?: string };
    if (e.message?.includes("not enabled") || e.message?.includes("Connect")) {
      console.log("❌ Connect NOT activated — accounts.list failed:");
      console.log("   ", e.message);
    } else {
      console.log(
        "⚠️ Unexpected error checking Connect:",
        e.type,
        "—",
        e.message,
      );
    }
  }
  console.log("");

  // ── Tax ──
  console.log("STRIPE TAX");
  console.log("-".repeat(50));
  try {
    const registrations = await stripe.tax.registrations.list({ limit: 100 });
    if (registrations.data.length === 0) {
      console.log(
        "⚠️ Stripe Tax callable but NO registrations exist. You need to register Australia as a tax jurisdiction in the dashboard.",
      );
    } else {
      console.log(
        `✅ Stripe Tax ACTIVE with ${registrations.data.length} registration(s):`,
      );
      for (const r of registrations.data) {
        console.log(
          `   - ${r.country}${r.country_options ? "" : ""} | status: ${r.status} | created: ${new Date(r.created * 1000).toISOString().slice(0, 10)}`,
        );
      }
      const auReg = registrations.data.find((r) => r.country === "AU");
      if (!auReg) {
        console.log(
          "⚠️ No Australia (AU) registration found. Code expects AU GST.",
        );
      }
    }
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string };
    if (
      e.message?.includes("not activated") ||
      e.code === "tax_inactive" ||
      e.message?.toLowerCase().includes("tax")
    ) {
      console.log("❌ Stripe Tax NOT activated — registrations.list failed:");
      console.log("   ", e.message);
    } else {
      console.log("⚠️ Unexpected error checking Tax:", e.type, "—", e.message);
    }
  }
  console.log("");

  // ── Webhook endpoints ──
  console.log("WEBHOOK ENDPOINTS");
  console.log("-".repeat(50));
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  console.log(`Found ${hooks.data.length} endpoint(s):`);
  for (const h of hooks.data) {
    console.log(
      `  - ${h.url}\n      events: ${h.enabled_events.length}, status: ${h.status}, id: ${h.id}`,
    );
  }
  console.log("");

  // ── Products ──
  console.log("PRODUCTS + PRICES");
  console.log("-".repeat(50));
  const products = await stripe.products.list({ active: true, limit: 100 });
  const bbProducts = products.data.filter((p) =>
    p.name.startsWith("Baby Bloom"),
  );
  console.log(`Baby Bloom products: ${bbProducts.length}`);
  for (const p of bbProducts) {
    const prices = await stripe.prices.list({ product: p.id, active: true });
    console.log(`  - ${p.name} (${p.id})`);
    for (const pr of prices.data) {
      const cents = pr.unit_amount ?? 0;
      const recurring = pr.recurring
        ? `/${pr.recurring.interval}`
        : " one-time";
      console.log(
        `      price ${pr.id}: ${pr.currency.toUpperCase()} ${(cents / 100).toFixed(2)}${recurring}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
