/**
 * Shared upload-error mapping.
 *
 * Extracted from `src/components/bapp/shared/ImageUpload.tsx` per T-028
 * Wave 1 so every media-upload surface speaks the same error language.
 *
 * The helper maps a server response (HTTP status + parsed body) to
 * user-actionable copy, varied per upload surface so the message reads
 * naturally where it appears.
 *
 * Backwards compatibility: the helper recognises BOTH the new
 * structured error codes (per `04-server-side-hardening.md` §B) AND the
 * legacy human-readable strings the routes return today (e.g.
 * "Image must be under 10MB"). This lets us roll out the structured
 * envelope route-by-route without breaking the FAB in the meantime.
 * (Ratified K4.2 by Bailey 2026-05-20.)
 *
 * Scope: MEDIA surfaces only. Verification surfaces (passport, selfie,
 * WWCC, parent ID) get their own error mapper in T-029 — the failure
 * modes there are different and the user copy needs different framing.
 * Do NOT add a "verification" member to {@link UploadSurface}; that
 * union deliberately ends at media surfaces.
 */

/** The surfaces this helper supports. */
export type UploadSurface =
  | "child-feed"
  | "chat"
  | "nanny-funnel"
  | "parent-avatar"
  | "nanny-avatar"
  | "nanny-gallery"
  | "share-screenshot";

/** Shape the helper accepts from the server-side error response.
 *  `reason` is reserved for finer-grained context (e.g. consent-state
 *  detail on a 403). The helper does not branch on it today but it is
 *  preserved in the interface for forward-compat with the structured
 *  envelope rollout per `04-server-side-hardening.md` §B. */
export interface UploadErrorBody {
  error?: string;
  reason?: string;
}

/**
 * Map a server response to a user-friendly error message.
 *
 * @param status  HTTP status code from `res.status`.
 * @param body    Parsed JSON body (may be undefined if parse failed).
 * @param surface Which upload surface this error is for — drives the
 *                exact wording in cases where context matters
 *                (e.g. the consent gate copy only makes sense for
 *                `child-feed`).
 * @returns User-facing copy. Always non-empty.
 */
export function mapUploadError(
  status: number,
  body: UploadErrorBody | undefined,
  surface: UploadSurface,
): string {
  // 401 — not authenticated.
  if (status === 401) {
    return "Sign in expired — refresh and try again.";
  }

  // 403 — media-consent gate (T-015). Only the FAB child-feed route
  // gates on this code today; narrowing the child-specific copy to that
  // surface only avoids confusing copy on other surfaces that might
  // return the same code in the future (e.g. if chat ever adds a
  // consent gate, the message will need its own framing).
  // NOTE: this 403 branch MUST stay above the generic 403 branch below
  // — order is load-bearing here.
  if (status === 403 && body?.error === "media_consent_required") {
    if (surface === "child-feed") {
      return "Waiting for the parent to accept the consent for this child before photos can be uploaded.";
    }
    // Other surfaces: report generically (no child-scoped copy).
    return "You don't have permission to upload here right now.";
  }

  // 403 — permission denied (generic). MUST sit below the
  // media_consent_required branch above; reordering breaks that path.
  if (status === 403) {
    return "You don't have permission to upload here.";
  }

  // 400 — file too large (structured OR legacy string).
  if (
    status === 400 &&
    (body?.error === "file_too_large" ||
      body?.error === "Image must be under 10MB")
  ) {
    if (surface === "parent-avatar" || surface === "nanny-avatar") {
      return "Photo is too large. Try a smaller image.";
    }
    return "Photo is too large. Try a smaller image or one taken at lower resolution.";
  }

  // 400 — invalid file type (structured OR legacy string).
  if (
    status === 400 &&
    (body?.error === "invalid_type" || body?.error === "File must be an image")
  ) {
    return "Only image files are supported.";
  }

  // 400 — required field missing.
  if (status === 400 && body?.error === "missing_field") {
    return "Something is missing on the form. Refresh the page and try again.";
  }

  // 413 — payload too large. Rare (Vercel edge usually drops first) but
  // possible on infra that doesn't enforce the edge cap.
  if (status === 413) {
    return "Photo is too large to upload. Try a smaller image.";
  }

  // Anything else (500, unmapped 400/403, network errors that became 0).
  return "Upload failed. Try again or skip the photo.";
}
