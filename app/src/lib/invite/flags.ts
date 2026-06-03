/**
 * Single source of truth for the invite-link kill switch.
 * Lives outside the "use server" boundary so non-action callers
 * (server components, page-level guards) can read it synchronously.
 */
export function invitesDisabled(): boolean {
  return process.env.INVITE_LINKS_ENABLED === "false";
}

/**
 * Kill switch for the bonus-program onboarding flow (T-022).
 *
 * When this returns true (env=false), the new contributions page at
 * `/nanny/onboarding/add-child` is unreachable — the page-level guard
 * redirects to `/nanny/onboarding-verification?startAt=1` and the Step 0
 * AccountSecured CTA falls back to the legacy "Verify Account" behaviour.
 *
 * Server-only (mirrors `invitesDisabled` shape). For the client-side
 * check inside OnboardingVerificationClient, read
 * `NEXT_PUBLIC_BONUS_PROGRAM_ENABLED` directly — the public flag is
 * the partner of this server flag.
 *
 * IMPORTANT — keep the two env vars in lock-step:
 *   BONUS_PROGRAM_ENABLED              (server)
 *   NEXT_PUBLIC_BONUS_PROGRAM_ENABLED  (client)
 *
 * Both should always be set to the same value in every deployment
 * environment. The most dangerous mis-set is `BONUS_PROGRAM_ENABLED`
 * unset but `NEXT_PUBLIC_BONUS_PROGRAM_ENABLED=false` — the client
 * hides the CTA but the new page remains reachable by direct URL,
 * leaving an open back door into a "disabled" feature.
 *
 * Lives outside the "use server" boundary so server components can
 * import it synchronously.
 */
export function bonusProgramDisabled(): boolean {
  return process.env.BONUS_PROGRAM_ENABLED === "false";
}
