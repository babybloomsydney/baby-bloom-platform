/**
 * Canonical literal-union type for `nannies.payout_application_status`.
 *
 * Mirrors the SQL CHECK constraint in
 * `app/supabase/migrations/nannies-payout-status-constraint-fix.sql`,
 * which intentionally accepts BOTH the original migration's enum values
 * AND the code-side enum the rest of the app writes. New code should
 * prefer the code-side values (`verified`, `restricted`, `pending`)
 * over the original migration's (`approved`, `requires_action`,
 * `pending_review`); both are accepted at the DB layer for migration
 * back-compat.
 */

export type PayoutApplicationStatus =
  | "not_applied"
  | "in_progress"
  | "pending"
  | "pending_review"
  | "verified"
  | "approved"
  | "restricted"
  | "requires_action"
  | "rejected";

const ALL_STATUSES: ReadonlySet<PayoutApplicationStatus> =
  new Set<PayoutApplicationStatus>([
    "not_applied",
    "in_progress",
    "pending",
    "pending_review",
    "verified",
    "approved",
    "restricted",
    "requires_action",
    "rejected",
  ]);

/**
 * Narrow an arbitrary string (e.g. raw DB value) to PayoutApplicationStatus.
 * Returns `"not_applied"` for unknown values so callers stay on a
 * defined branch rather than passing a typo through unchecked.
 */
export function toPayoutApplicationStatus(
  raw: string | null | undefined,
): PayoutApplicationStatus {
  if (raw && ALL_STATUSES.has(raw as PayoutApplicationStatus)) {
    return raw as PayoutApplicationStatus;
  }
  return "not_applied";
}

/** Convenience: which values represent an active, payout-eligible nanny. */
export function isPayoutVerified(status: PayoutApplicationStatus): boolean {
  return status === "verified" || status === "approved";
}
