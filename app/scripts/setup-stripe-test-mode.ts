/**
 * setup-stripe-test-mode.ts
 *
 * Provisions the Stripe TEST-MODE resources required for the Baby
 * Bloom PAYMENTS build via the Stripe API:
 *
 *  - 2 products (Monthly + Upfront) + their default prices
 *  - 1 Customer Portal configuration
 *  - 2 webhook endpoints (main + Connect)
 *
 * Idempotent: re-running won't create duplicates. The script searches
 * for existing resources by name / URL and reuses them.
 *
 * Run: `npx tsx scripts/setup-stripe-test-mode.ts`
 *
 * Requirements:
 *  - STRIPE_SECRET_KEY in `.env.local`, starting with `sk_test_` (the
 *    script REFUSES to run against live keys — separate live setup
 *    happens AFTER Bailey + accountant + lawyer sign off).
 *  - You've already activated Connect in the Stripe Dashboard (Section 1
 *    of STRIPE-SETUP-INSTRUCTIONS.md).
 *  - Optional: pass `--base-url=https://<vercel-preview>` to override
 *    where webhook endpoints point. Defaults to NEXT_PUBLIC_APP_URL or
 *    `http://localhost:3000` (only useful with Stripe CLI forwarding).
 *
 * Output: appends captured IDs + secrets to `.env.local` under a
 * managed block (won't clobber existing values).
 */

import Stripe from "stripe";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const MANAGED_BLOCK_START =
  "# ─── stripe-test-mode setup (managed by scripts/setup-stripe-test-mode.ts) ───";
const MANAGED_BLOCK_END = "# ─── end stripe-test-mode setup ───";

loadEnv({ path: ENV_PATH });

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("Missing STRIPE_SECRET_KEY in .env.local. Aborting.");
  process.exit(1);
}
if (!secretKey.startsWith("sk_test_")) {
  console.error(
    "REFUSING TO RUN against a non-test key. STRIPE_SECRET_KEY must start with `sk_test_` for this script. Live-mode setup is a separate manual step after compliance sign-off.",
  );
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const baseUrl =
  args["base-url"] ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const stripe = new Stripe(secretKey, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: "2026-04-22.dahlia" as any,
  appInfo: {
    name: "Baby Bloom Sydney — setup script",
    url: "https://babybloomsydney.com.au",
  },
});

interface CapturedIds {
  STRIPE_PRODUCT_MONTHLY_ID: string;
  STRIPE_PRICE_MONTHLY_ID: string;
  STRIPE_PRODUCT_UPFRONT_ID: string;
  STRIPE_PRICE_UPFRONT_ID: string;
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID: string;
  STRIPE_WEBHOOK_ENDPOINT_ID: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_CONNECT_WEBHOOK_ENDPOINT_ID: string;
  STRIPE_CONNECT_WEBHOOK_SECRET: string;
}

async function main() {
  console.log("Stripe test-mode setup\n" + "=".repeat(60));
  console.log(`Base URL for webhooks: ${baseUrl}`);
  console.log("");

  const monthly = await ensureProductWithPrice({
    productName: "Baby Bloom — Monthly Subscription",
    description:
      "Monthly subscription giving the family full access to Baby Bloom's child-development tools, AI assistant, and recorded development history.",
    unitAmount: 200_00,
    currency: "aud",
    recurring: { interval: "month" },
  });

  const upfront = await ensureProductWithPrice({
    productName: "Baby Bloom — Upfront Subscription",
    description:
      "One-time payment covering up to 4 years of Baby Bloom access (until the child's 5th birthday).",
    unitAmount: 2000_00,
    currency: "aud",
    recurring: null,
  });

  const portalConfigId = await ensurePortalConfig();

  const mainWebhook = await ensureWebhookEndpoint({
    url: `${baseUrl}/api/webhooks/stripe`,
    description: "Baby Bloom main webhook — subscriptions, invoices, refunds",
    enabledEvents: [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.refunded",
    ],
    connect: false,
  });

  const connectWebhook = await ensureWebhookEndpoint({
    url: `${baseUrl}/api/webhooks/stripe-connect`,
    description:
      "Baby Bloom Connect webhook — nanny payouts + account verification",
    enabledEvents: [
      "account.updated",
      "payout.paid",
      "payout.failed",
      "transfer.created",
      "transfer.updated",
      "transfer.reversed",
    ],
    connect: true,
  });

  const captured: CapturedIds = {
    STRIPE_PRODUCT_MONTHLY_ID: monthly.productId,
    STRIPE_PRICE_MONTHLY_ID: monthly.priceId,
    STRIPE_PRODUCT_UPFRONT_ID: upfront.productId,
    STRIPE_PRICE_UPFRONT_ID: upfront.priceId,
    STRIPE_BILLING_PORTAL_CONFIGURATION_ID: portalConfigId,
    STRIPE_WEBHOOK_ENDPOINT_ID: mainWebhook.id,
    STRIPE_WEBHOOK_SECRET: mainWebhook.secret,
    STRIPE_CONNECT_WEBHOOK_ENDPOINT_ID: connectWebhook.id,
    STRIPE_CONNECT_WEBHOOK_SECRET: connectWebhook.secret,
  };

  appendToEnv(captured);

  console.log("");
  console.log("=".repeat(60));
  console.log("Done. Captured IDs + secrets written to .env.local under:");
  console.log(`  ${MANAGED_BLOCK_START}`);
  console.log(`  ${MANAGED_BLOCK_END}`);
  console.log("");
  console.log("Next:");
  console.log(
    "  1. Set STRIPE_MODE=test in .env.local (if not already) so the client picks the right keys.",
  );
  console.log(
    "  2. Set PAYMENTS_ENABLED=true to enable the Subscribe flow (still in test mode — real cards are sandboxed).",
  );
  console.log("  3. Replicate these env vars to Vercel Preview if desired.");
  console.log("");
  console.log(
    "Note: webhook endpoints were registered against the URL above. If you're testing locally, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and override STRIPE_WEBHOOK_SECRET with the CLI's value for local-only testing.",
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ProductWithPriceInput {
  productName: string;
  description: string;
  unitAmount: number;
  currency: "aud";
  recurring: { interval: "month" } | null;
}

interface ProductWithPriceResult {
  productId: string;
  priceId: string;
}

async function ensureProductWithPrice(
  input: ProductWithPriceInput,
): Promise<ProductWithPriceResult> {
  // Search by name. The Search API requires a paid plan — fall back to
  // list + filter for test mode reliability.
  const existing = await findProductByName(input.productName);

  let productId: string;
  if (existing) {
    console.log(`  ⊙ Product exists: ${input.productName} (${existing.id})`);
    productId = existing.id;
  } else {
    const product = await stripe.products.create(
      {
        name: input.productName,
        description: input.description,
      },
      { idempotencyKey: `product-${slug(input.productName)}` },
    );
    console.log(`  ✓ Product created: ${input.productName} (${product.id})`);
    productId = product.id;
  }

  // Find an active price matching shape (currency + amount + recurring).
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  const matchingPrice = prices.data.find(
    (p) =>
      p.currency === input.currency &&
      p.unit_amount === input.unitAmount &&
      ((input.recurring === null && p.recurring === null) ||
        (input.recurring !== null &&
          p.recurring?.interval === input.recurring.interval)),
  );

  let priceId: string;
  if (matchingPrice) {
    console.log(
      `  ⊙ Price exists for ${input.productName} (${matchingPrice.id})`,
    );
    priceId = matchingPrice.id;
  } else {
    const price = await stripe.prices.create(
      {
        product: productId,
        unit_amount: input.unitAmount,
        currency: input.currency,
        tax_behavior: "inclusive",
        ...(input.recurring
          ? { recurring: { interval: input.recurring.interval } }
          : {}),
      },
      {
        idempotencyKey: `price-${slug(input.productName)}-${input.unitAmount}`,
      },
    );
    console.log(`  ✓ Price created: ${input.productName} (${price.id})`);
    priceId = price.id;
  }

  return { productId, priceId };
}

async function findProductByName(name: string): Promise<Stripe.Product | null> {
  // Paginate manually; Stripe API caps list at 100 per page.
  let starting_after: string | undefined = undefined;
  for (let page = 0; page < 10; page++) {
    const list: Stripe.ApiList<Stripe.Product> = await stripe.products.list({
      limit: 100,
      active: true,
      ...(starting_after ? { starting_after } : {}),
    });
    const match = list.data.find((p) => p.name === name);
    if (match) return match;
    if (!list.has_more) break;
    starting_after = list.data[list.data.length - 1]?.id;
    if (!starting_after) break;
  }
  return null;
}

async function ensurePortalConfig(): Promise<string> {
  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const active = list.data.find(
    (c) =>
      c.active &&
      typeof c.business_profile === "object" &&
      c.business_profile.headline?.includes("Baby Bloom"),
  );
  if (active) {
    console.log(`  ⊙ Portal config exists: ${active.id}`);
    return active.id;
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your Baby Bloom subscription",
      privacy_policy_url: "https://babybloomsydney.com.au/privacy",
      terms_of_service_url: "https://babybloomsydney.com.au/terms",
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "tax_id"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "unused",
            "customer_service",
            "too_complex",
            "low_quality",
            "other",
          ],
        },
      },
    },
    default_return_url: "https://babybloomsydney.com.au/parent/subscription",
  });
  console.log(`  ✓ Portal config created: ${config.id}`);
  return config.id;
}

interface WebhookEndpointInput {
  url: string;
  description: string;
  enabledEvents: string[];
  connect: boolean;
}

interface WebhookEndpointResult {
  id: string;
  secret: string;
}

async function ensureWebhookEndpoint(
  input: WebhookEndpointInput,
): Promise<WebhookEndpointResult> {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = list.data.find((e) => e.url === input.url);
  if (existing) {
    console.log(`  ⊙ Webhook exists: ${input.url} (${existing.id})`);
    // CRITICAL: Stripe only returns the signing secret on CREATE. If
    // the endpoint already exists, we cannot recover the secret via the
    // API — Bailey must look it up in the dashboard. Surface this loudly.
    console.warn(
      `    ! Cannot re-derive signing secret for existing webhook. Look it up at https://dashboard.stripe.com/test/webhooks/${existing.id}`,
    );
    return {
      id: existing.id,
      secret: `__LOOKUP_IN_DASHBOARD__${existing.id}`,
    };
  }
  const created = await stripe.webhookEndpoints.create({
    url: input.url,
    description: input.description,
    enabled_events:
      input.enabledEvents as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
    ...(input.connect ? { connect: true } : {}),
  });
  console.log(`  ✓ Webhook created: ${input.url} (${created.id})`);
  return {
    id: created.id,
    secret: created.secret ?? "__MISSING_SECRET__",
  };
}

function appendToEnv(captured: CapturedIds): void {
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
  // Strip any existing managed block — we rewrite the whole thing each run.
  const stripped = stripManagedBlock(current);
  const lines: string[] = [
    "",
    MANAGED_BLOCK_START,
    "# Last updated: " + new Date().toISOString(),
    ...Object.entries(captured).map(([k, v]) => `${k}=${v}`),
    MANAGED_BLOCK_END,
    "",
  ];
  writeFileSync(ENV_PATH, stripped.trimEnd() + "\n" + lines.join("\n"));
}

function stripManagedBlock(content: string): string {
  const startIdx = content.indexOf(MANAGED_BLOCK_START);
  const endIdx = content.indexOf(MANAGED_BLOCK_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return content;
  return (
    content.slice(0, startIdx) +
    content.slice(endIdx + MANAGED_BLOCK_END.length)
  );
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

main().catch((err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
