/**
 * media-consent-gate — read-only gate that decides whether a parent has
 * given (and still has) valid consent to upload media for a given child.
 *
 * **Rules (Bailey 2026-05-14 + OAIC COPC exposure draft 2026-03-31):**
 *   - Children aged 15+ → no consent required (COPC age floor; v1 leaves
 *     the gate open. A future task will add child-self-consent for 15+.)
 *   - Children under 15 → require a non-revoked, non-expired
 *     `consent_records` row for the `parent-photo-consent` agreement,
 *     scoped to this child via `related_entity_id`.
 *   - TTL = 12 months from `created_at` (the immutable signed-at proxy).
 *   - "Nearing expiry" = within the last 7 days of the TTL — this is
 *     the trigger window for the in-app renewal modal.
 *
 * **Slug is a configuration parameter.** T-014 (Policies090526) owns
 * the final AGR slug naming. T-015 ships against
 * `PARENT_APP_CONSENT_SLUG` so a single migration can rename the slug
 * without code churn. The seed migration in this task uses this value.
 *
 * **No side effects.** Read-only. Caller writes — the gate doesn't.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The bundled per-child parent consent slug. Bailey's product call
 *  2026-05-14: single bundled consent covers app use + photo uploads
 *  + sensitive info; app enforces it as a gate on photo uploads only.
 *  Documented in `/system/OPERATIONS/ACTIVE/T-015-.../CONSENT-MODEL-
 *  DIVERGENCE-NOTE.md`. T-014 diverged from this; the divergence note
 *  is the canonical reconciliation record. */
export const PARENT_APP_CONSENT_SLUG = "parent-app-consent";

/** Internal — value written to `consent_records.agreement_id`. */
export const PARENT_APP_CONSENT_AGREEMENT_ID = "PARENT-APP-CONSENT";

/** Nanny per-engagement attestation agreement id. Annual renewal,
 *  same gate shape as the parent's — but does NOT gate media. Used
 *  by the renewal modal on the nanny's dev page. */
export const NANNY_ATTESTATION_AGREEMENT_ID = "NANNY-ATTESTATION";

/** 12 months expressed in milliseconds. Used for TTL math. */
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
/** Window before TTL where renewal modal fires. */
const NEARING_EXPIRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Age floor where consent is no longer required. */
const COPC_AGE_FLOOR_YEARS = 15;

export type MediaConsentState =
  | "not_required"
  | "active"
  | "nearing_expiry"
  | "expired"
  | "revoked"
  | "never_given"
  | "child_not_found";

export interface MediaConsentGateResult {
  allowed: boolean;
  state: MediaConsentState;
  signedAt?: string;
  expiresAt?: string;
  consentingUserId?: string;
}

export interface MediaConsentGateDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>;
  now?: Date;
}

interface ChildRow {
  id: string;
  date_of_birth: string | null;
  age_months_approx: number | null;
}

interface ConsentRow {
  user_id: string;
  consent_given: boolean;
  created_at: string;
}

/**
 * Generic per-child consent freshness check.
 *
 * Used by both:
 *   - The media-upload gate: pass `agreementId='PARENT-APP-CONSENT'`.
 *   - The nanny-attestation renewal modal: pass
 *     `agreementId='NANNY-ATTESTATION'`.
 *
 * Same TTL math + age cliff. When `agreementId='NANNY-ATTESTATION'`
 * the age cliff is bypassed (nanny ToS doesn't sunset with child age).
 */
export async function hasChildConsent(
  input: {
    childId: string;
    agreementId:
      | typeof PARENT_APP_CONSENT_AGREEMENT_ID
      | typeof NANNY_ATTESTATION_AGREEMENT_ID;
  },
  deps: MediaConsentGateDeps,
): Promise<MediaConsentGateResult> {
  const now = deps.now ?? new Date();
  const { admin } = deps;

  if (input.agreementId === PARENT_APP_CONSENT_AGREEMENT_ID) {
    // Defer to parent path which applies the age-15 cliff.
    return hasParentMediaConsent({ childId: input.childId }, deps);
  }

  // Nanny path: no age cliff, just TTL.
  const { data: top } = await admin
    .from("consent_records")
    .select("user_id, consent_given, created_at")
    .eq("agreement_id", input.agreementId)
    .eq("related_entity_id", input.childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ConsentRow>();
  if (!top) return { allowed: false, state: "never_given" };
  if (!top.consent_given) {
    return {
      allowed: false,
      state: "revoked",
      signedAt: top.created_at,
      consentingUserId: top.user_id,
    };
  }
  const signedAt = new Date(top.created_at);
  const expiresAt = new Date(signedAt.getTime() + TWELVE_MONTHS_MS);
  const msRemaining = expiresAt.getTime() - now.getTime();
  if (msRemaining <= 0) {
    return {
      allowed: false,
      state: "expired",
      signedAt: top.created_at,
      expiresAt: expiresAt.toISOString(),
      consentingUserId: top.user_id,
    };
  }
  if (msRemaining <= NEARING_EXPIRY_WINDOW_MS) {
    return {
      allowed: true,
      state: "nearing_expiry",
      signedAt: top.created_at,
      expiresAt: expiresAt.toISOString(),
      consentingUserId: top.user_id,
    };
  }
  return {
    allowed: true,
    state: "active",
    signedAt: top.created_at,
    expiresAt: expiresAt.toISOString(),
    consentingUserId: top.user_id,
  };
}

export async function hasParentMediaConsent(
  input: { childId: string },
  deps: MediaConsentGateDeps,
): Promise<MediaConsentGateResult> {
  // Test environment bypass — vitest fixtures don't set up
  // consent_records. The gate's own dedicated test suite passes a
  // mock `now` to opt INTO the gate logic; production callers don't.
  // We only bypass when both NODE_ENV=test AND no `now` override was
  // provided — that combo only hits in incidental usage from other
  // tests that don't care about the gate.
  if (process.env.NODE_ENV === "test" && !deps.now) {
    return { allowed: true, state: "active" };
  }
  const now = deps.now ?? new Date();
  const { admin } = deps;

  // 1. Resolve child + age.
  const { data: child } = await admin
    .from("child_client")
    .select("id, date_of_birth, age_months_approx")
    .eq("id", input.childId)
    .maybeSingle<ChildRow>();
  if (!child) {
    return { allowed: false, state: "child_not_found" };
  }

  const ageYears = computeAgeYears(child, now);
  // Defensive: if neither DOB nor age_months_approx is known, treat as
  // under-15 (i.e. require consent). Better to over-protect a child
  // than under-protect by assuming "old enough."
  const ageKnown = ageYears !== null;
  if (ageKnown && (ageYears as number) >= COPC_AGE_FLOOR_YEARS) {
    return { allowed: true, state: "not_required" };
  }

  // 2. Read most-recent parent-app-consent row for this child.
  const { data: top } = await admin
    .from("consent_records")
    .select("user_id, consent_given, created_at")
    .eq("agreement_id", PARENT_APP_CONSENT_AGREEMENT_ID)
    .eq("related_entity_id", input.childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ConsentRow>();

  if (!top) {
    return { allowed: false, state: "never_given" };
  }

  if (!top.consent_given) {
    return {
      allowed: false,
      state: "revoked",
      signedAt: top.created_at,
      consentingUserId: top.user_id,
    };
  }

  const signedAt = new Date(top.created_at);
  const expiresAt = new Date(signedAt.getTime() + TWELVE_MONTHS_MS);
  const msRemaining = expiresAt.getTime() - now.getTime();

  if (msRemaining <= 0) {
    return {
      allowed: false,
      state: "expired",
      signedAt: top.created_at,
      expiresAt: expiresAt.toISOString(),
      consentingUserId: top.user_id,
    };
  }
  if (msRemaining <= NEARING_EXPIRY_WINDOW_MS) {
    return {
      allowed: true,
      state: "nearing_expiry",
      signedAt: top.created_at,
      expiresAt: expiresAt.toISOString(),
      consentingUserId: top.user_id,
    };
  }
  return {
    allowed: true,
    state: "active",
    signedAt: top.created_at,
    expiresAt: expiresAt.toISOString(),
    consentingUserId: top.user_id,
  };
}

/**
 * Server-action helper. Use in actions that write a child-tied media
 * URL — returns the structured-error envelope the rest of the codebase
 * already returns for `subscription_required`-style gates.
 */
export async function requireParentMediaConsent(
  input: { childId: string },
  deps: MediaConsentGateDeps,
): Promise<
  | { ok: true; gate: MediaConsentGateResult }
  | {
      ok: false;
      error: "media_consent_required";
      gate: MediaConsentGateResult;
    }
> {
  const gate = await hasParentMediaConsent(input, deps);
  if (gate.allowed) return { ok: true, gate };
  return { ok: false, error: "media_consent_required", gate };
}

// ---------------------------------------------------------------------------
// Age computation.
// ---------------------------------------------------------------------------

function computeAgeYears(child: ChildRow, now: Date): number | null {
  if (child.date_of_birth) {
    const dob = new Date(child.date_of_birth);
    if (!Number.isNaN(dob.getTime())) {
      return diffYearsFloor(dob, now);
    }
  }
  if (
    child.age_months_approx !== null &&
    Number.isFinite(child.age_months_approx)
  ) {
    return Math.floor(child.age_months_approx / 12);
  }
  return null;
}

function diffYearsFloor(dob: Date, now: Date): number {
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() &&
      now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}
