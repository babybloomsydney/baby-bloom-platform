export const SITE_NAME = "Baby Bloom Sydney";
export const SITE_DESCRIPTION =
  "Connecting Sydney families with trusted nannies";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// VERIFICATION_TIERS was removed along with the deprecated Tier 1-2-3
// system. Use `verification_level` + `verification_status` from
// @/lib/verification instead. See system/verification/** for the
// canonical docs.

export const MATCHING_WEIGHTS = {
  RATE: 0.3,
  EXPERIENCE: 0.25,
  QUALIFICATIONS: 0.2,
  SKILLS: 0.15,
  OTHER: 0.1,
} as const;

export const BSR_NOTIFICATION_LIMIT = 20;
