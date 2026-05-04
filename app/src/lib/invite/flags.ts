/**
 * Single source of truth for the invite-link kill switch.
 * Lives outside the "use server" boundary so non-action callers
 * (server components, page-level guards) can read it synchronously.
 */
export function invitesDisabled(): boolean {
  return process.env.INVITE_LINKS_ENABLED === "false";
}
