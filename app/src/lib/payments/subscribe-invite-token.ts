/**
 * Subscribe-invite token utilities — extracted from
 * `lib/actions/payments/createSubscribeInvite.ts` so consumers can
 * validate tokens WITHOUT pulling in the server-action module.
 *
 * Next.js 14 enforces that every export from a "use server" file is
 * an async server action; a sync validator co-located there breaks
 * the build. Keeping the validator (+ shared regex) here lets server
 * components, page components, and other actions all share one
 * implementation.
 *
 * Format: `XXXX-XXXX` — 4-char + hyphen + 4-char, drawn from a
 * Crockford-like alphabet (uppercase A–Z minus I/L/O + digits 2–9, no
 * 0/1). Matches child-invites + subscribe-invites schema constraint.
 */

export const SUBSCRIBE_INVITE_TOKEN_ALPHABET =
  "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const SUBSCRIBE_INVITE_TOKEN_REGEX =
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/**
 * Validate token format BEFORE any DB call — same defence-in-depth
 * pattern as child-invites. Malformed tokens never reach Postgres.
 */
export function isValidSubscribeInviteToken(token: unknown): token is string {
  return typeof token === "string" && SUBSCRIBE_INVITE_TOKEN_REGEX.test(token);
}
