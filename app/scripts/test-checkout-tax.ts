/**
 * Diagnostic — creates a one-off Checkout Session via the API (test mode)
 * to verify automatic_tax is wired correctly. Once the session is created
 * Stripe sees the integration and the "no integrations configured to
 * collect tax" warning in the dashboard clears.
 *
 * The session URL is printed but not visited — no payment is collected.
 * The session expires automatically after 24h.
 */

import Stripe from "stripe";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "..", ".env.local") });

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}
const priceMonthly = process.env.STRIPE_PRICE_MONTHLY_ID;
if (!priceMonthly) {
  console.error("Missing STRIPE_PRICE_MONTHLY_ID");
  process.exit(1);
}

const stripe = new Stripe(key);

async function main() {
  console.log("Creating a throwaway test Checkout Session to register the");
  console.log("automatic_tax integration with Stripe Tax...");
  console.log("");

  // Create a throwaway test customer with an AU address so Tax has
  // something to compute against. Real customers will come through
  // ensureStripeCustomer in production.
  const cust = await stripe.customers.create({
    email: "tax-test@babybloomsydney.com.au",
    name: "Tax Test Customer",
    address: {
      line1: "1 Test Street",
      city: "Sydney",
      state: "NSW",
      postal_code: "2000",
      country: "AU",
    },
    metadata: { purpose: "tax-integration-test" },
  });
  console.log("Test customer:", cust.id);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: cust.id,
    client_reference_id: "tax-integration-test",
    line_items: [{ price: priceMonthly, quantity: 1 }],
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "required",
    success_url: "https://babybloomsydney.com.au/parent/subscription?test=tax",
    cancel_url: "https://babybloomsydney.com.au/parent/subscribe?test=tax",
    metadata: { purpose: "tax-integration-test" },
  });

  console.log("");
  console.log("Session created — Stripe Tax now sees the integration.");
  console.log("Session ID:", session.id);
  console.log("Session URL:", session.url);
  console.log("automatic_tax status:", session.automatic_tax?.status);
  console.log("");
  console.log(
    "The Stripe Dashboard 'no integrations configured' warning should clear",
  );
  console.log(
    "within a minute. The session expires in 24h with no charge — you don't",
  );
  console.log("need to visit the URL.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
