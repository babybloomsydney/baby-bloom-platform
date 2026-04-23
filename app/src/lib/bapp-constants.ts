// =============================================================================
// Baby Bloom Education App — Constants
// =============================================================================

export const DOMAINS = {
  CL: { label: "Communication & Language", short: "Communication", color: "blue" },
  PSE: { label: "Personal, Social & Emotional", short: "Social", color: "pink" },
  PD: { label: "Physical Development", short: "Physical", color: "green" },
  LIT: { label: "Literacy", short: "Literacy", color: "purple" },
  NUM: { label: "Numeracy", short: "Numeracy", color: "orange" },
  UW: { label: "Understanding the World", short: "World", color: "teal" },
  EAD: { label: "Expressive Arts & Design", short: "Art", color: "amber" },
} as const;

export type DomainCode = keyof typeof DOMAINS;

export const DOMAIN_CODES = Object.keys(DOMAINS) as DomainCode[];

export const MASTERY_LABELS = {
  0: "Unattempted",
  1: "Introduced",
  2: "Assisted",
  3: "Guided",
  4: "Independent",
} as const;

export type MasteryScore = 0 | 1 | 2 | 3 | 4;

export const MAX_MILESTONES_PER_ACTIVITY = 3;

export const FEED_POLL_INTERVAL = 10_000; // 10 seconds

export const LOG_TYPES = [
  "activity",
  "report",
  "progress",
  "observation",
  "diary",
  "insight",
] as const;
