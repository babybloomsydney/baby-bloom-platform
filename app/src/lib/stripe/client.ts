/**
 * Stripe SDK singleton — the only place in the codebase that constructs a
 * `Stripe` instance. Everything else imports `getStripeClient()` (or one of
 * the wrapper modules in this folder).
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §2 (env vars) + §4
 * (module structure).
 *
 * Mode is gated by `STRIPE_MODE`. The `STRIPE_SECRET_KEY` env var must
 * hold the matching `sk_test_*` or `sk_live_*` key — we do NOT auto-pick
 * keys based on mode. Mismatched mode + key throws on construction.
 *
 * Server-only. Importing this from a `'use client'` module will fail at
 * build time because Stripe's Node SDK is not browser-safe.
 */

import Stripe from "stripe";

import type { StripeMode } from "@/types/payments";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

let cachedClient: Stripe | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readMode(): StripeMode {
  const raw = process.env.STRIPE_MODE;
  if (raw === "live") return "live";
  if (raw === "test") return "test";
  throw new Error(
    `STRIPE_MODE must be 'test' or 'live' — got ${JSON.stringify(raw)}`,
  );
}

function assertKeyMatchesMode(secretKey: string, mode: StripeMode): void {
  if (mode === "live" && !secretKey.startsWith("sk_live_")) {
    throw new Error(
      "STRIPE_MODE=live requires a 'sk_live_*' STRIPE_SECRET_KEY",
    );
  }
  if (mode === "test" && !secretKey.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_MODE=test requires a 'sk_test_*' STRIPE_SECRET_KEY",
    );
  }
}

/**
 * Returns the lazily-constructed Stripe client. Reads + validates env on
 * first call; subsequent calls return the cached instance.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const secretKey = readEnv("STRIPE_SECRET_KEY");
  const mode = readMode();
  assertKeyMatchesMode(secretKey, mode);

  cachedClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: {
      name: "Baby Bloom Sydney",
      url: "https://babybloomsydney.com.au",
    },
  });

  return cachedClient;
}

/**
 * Returns the resolved Stripe mode without forcing client construction.
 * Useful for UI gating (e.g. "TEST MODE" badge) that doesn't need the SDK.
 */
export function getStripeMode(): StripeMode {
  return readMode();
}

/**
 * For tests: clear the cached client between cases so env-var changes
 * are observed. Not exported via the module barrel.
 */
export function __resetStripeClientForTests(): void {
  cachedClient = null;
}
