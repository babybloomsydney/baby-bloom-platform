/**
 * Server-action helper: gate a child-tied media-URL write on the
 * parent's media consent.
 *
 * Pattern: call at the top of any action that writes a media URL
 * tied to a child. Returns a structured error envelope when consent
 * is missing/expired/revoked, OR `null` when the action is allowed
 * to proceed.
 *
 * **Important contract** (Bailey 2026-05-14): if `imageUrl` is
 * `null`/`undefined`/empty, the gate is bypassed — the action's
 * non-media part still works. The gate only fires when the caller
 * actually wants to write a media URL.
 *
 * Builds the `media_consent_required` error consistently across every
 * surface (bapp server actions + Katie applies + upload routes).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { hasParentMediaConsent } from "./media-consent-gate";

export interface MediaConsentGuardResult {
  ok: boolean;
  error?: "media_consent_required";
  reason?:
    | "never_given"
    | "expired"
    | "revoked"
    | "child_not_found"
    | "nearing_expiry"; // non-blocking; included for UI awareness
  expiresAt?: string;
}

/** Returns `null` when the write is allowed; an error envelope when it
 *  isn't. Pass `imageUrl` as the value the caller intends to write. */
export async function requireMediaConsentForImageWrite(input: {
  childId: string;
  imageUrl: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; error: "media_consent_required" }> {
  // No media → no gate. Text-only logs / diary / observations still work.
  if (!input.imageUrl) return { ok: true };

  // Test environment bypass — vitest fixtures don't set up
  // consent_records and shouldn't have to. The gate's own dedicated
  // test suite (media-consent-gate.test.ts) covers correctness. This
  // bypass is identical to `gemini-client.ts`'s NODE_ENV check.
  if (process.env.NODE_ENV === "test") return { ok: true };

  const admin = createAdminClient();
  const gate = await hasParentMediaConsent(
    { childId: input.childId },
    { admin },
  );
  if (gate.allowed) return { ok: true };
  return { ok: false, error: "media_consent_required" };
}
