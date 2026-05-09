/**
 * Env-level kill-switch flags for the payments system.
 *
 * Mirror of `src/lib/chat/flags.ts` pattern. Read once at module load with
 * trim-aware boolean parsing — defends against trailing-newline env values
 * from `echo "true" | vercel env add` style provisioning.
 *
 * Spec references:
 * - `system/APP/PAYMENTS/04-stripe-integration.md` §2 (env vars)
 * - `system/APP/PAYMENTS/02-business-model.md` §10 (kill-switch semantics)
 *
 * Default for these flags is **true** (payments + payouts + new trials all
 * ON). This matches the staging/production rollout where the env vars are
 * explicitly set; any agent forgetting to wire the env vars in dev still
 * gets a working flow. To disable, set the env var to the literal string
 * `"false"` (case-insensitive). Anything else evaluates to true.
 *
 * Server-only — these flags must never be exposed via `NEXT_PUBLIC_*`.
 * Kill-switch state is privileged information.
 */

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const trimmed = value.trim();
  if (trimmed === "") return defaultValue;
  // Explicit "false" disables; everything else enables. Asymmetric so that
  // a typo (e.g. "Tre") fails safe to ON during launch.
  return trimmed.toLowerCase() !== "false" && trimmed !== "0";
}

/**
 * Master switch for the parent-subscription side of payments.
 *
 * When false, `createCheckoutSession` short-circuits with
 * `'payments_disabled'` and the Subscribe UI shows a maintenance message.
 * Webhook ingestion is **NOT** disabled by this flag — Stripe must keep
 * recording state changes for any in-flight subscriptions. This flag
 * gates *new* charges, not the back-end of already-charged customers.
 *
 * Default: true.
 */
export const PAYMENTS_ENABLED = parseBool(process.env.PAYMENTS_ENABLED, true);

/**
 * Master switch for the nanny-payout side.
 *
 * When false, `startPayoutApplication` blocks with `'payouts_disabled'`,
 * and the daily `send-nanny-payouts` cron skips the transfer step (rows
 * stay in `pending`, picked up on the next eligible run). Webhook
 * processing of Connect events still runs so account state stays fresh.
 *
 * Default: true.
 */
export const PAYOUTS_ENABLED = parseBool(process.env.PAYOUTS_ENABLED, true);

/**
 * Gate for kicking off NEW family trials.
 *
 * When false, `start_family_trial_if_first()` PG function still no-ops
 * its insert path (this flag is read at the action layer that *calls*
 * it). Existing trials continue to expire normally; new connects don't
 * mint new trials. Used to safely freeze acquisition without freezing
 * billing.
 *
 * Default: true.
 */
export const NEW_TRIALS_ENABLED = parseBool(
  process.env.NEW_TRIALS_ENABLED,
  true,
);

export interface PaymentsFlags {
  PAYMENTS_ENABLED: boolean;
  PAYOUTS_ENABLED: boolean;
  NEW_TRIALS_ENABLED: boolean;
}

/**
 * Snapshot of every payments flag — useful for admin debugging surfaces.
 * Never expose this aggregate over a user-facing API.
 */
export function getPaymentsFlags(): PaymentsFlags {
  return {
    PAYMENTS_ENABLED,
    PAYOUTS_ENABLED,
    NEW_TRIALS_ENABLED,
  };
}
