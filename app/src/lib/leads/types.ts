// T-032 — Shared types for the Nanny Contact Management page.
// Mirrors the database shape from migrations/T-032-nanny-contact-management.sql.

export const LEAD_STATUSES = [
  "untouched",
  "in_conversation",
  "responsive",
  "unresponsive",
  "dormant",
  "do_not_contact",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CONTACT_METHODS = [
  "call",
  "sms",
  "email",
  "whatsapp",
  "instagram",
  "in_person",
  "manual",
  "other",
] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const CONTACT_DIRECTIONS = ["outbound", "inbound"] as const;
export type ContactDirection = (typeof CONTACT_DIRECTIONS)[number];

export const CONTACT_OUTCOMES = [
  "answered",
  "voicemail",
  "no_answer",
  "replied",
  "booked",
  "not_interested",
  "bounced",
  "pending",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

// UI-suggested purpose values. The column is free-text, so operators can
// introduce new purposes without a migration; these are just the defaults.
export const CONTACT_PURPOSE_DEFAULTS = [
  "upsell-kids",
  "verification-nudge",
  "position-followup",
  "general",
  "other",
] as const;

// ── Table row shapes (mirror migration columns) ──

export interface NannyContactState {
  id: string;
  nanny_user_id: string;
  lead_status: LeadStatus;
  last_contact_at: string | null;
  total_contacts_manual_offset: number;
  responded_ever_override: boolean | null;
  next_action_at: string | null;
  pinned_note: string | null;
  assigned_operator: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadContact {
  id: string;
  nanny_user_id: string;
  contacted_at: string;
  method: ContactMethod;
  direction: ContactDirection;
  outcome: ContactOutcome | null;
  purpose: string | null;
  note: string | null;
  operator_handle: string;
  created_at: string;
  updated_at: string | null;
  edited_by: string | null;
}

export interface LeadNote {
  id: string;
  nanny_user_id: string;
  body: string;
  last_edited_by: string;
  created_at: string;
  updated_at: string;
}

// ── List row (denormalised projection used by the leads list view) ──

// Verification mini-chip state per dimension. `null` = unknown / not started.
export interface VerificationSnapshot {
  identity_verified: boolean | null;
  wwcc_verified: boolean | null;
  photo_present: boolean;
  abn_present: boolean;
  verification_level: number | null;
  verification_status: number | null;
}

export interface LeadRow {
  nanny_user_id: string;
  nanny_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_number: string | null;
  suburb: string | null;
  profile_picture_url: string | null;
  signup_at: string;
  verification: VerificationSnapshot;
  /** All children on the nanny's account (child_client.nanny_user_id, non-closed). */
  children_linked_count: number;
  /** Subset of children_linked_count whose parent has a Baby Bloom account (parent_user_id NOT NULL). */
  parent_linked_children_count: number;
  /** Subset added via T-022 bonus contributions program (child_invites.bonus_program=true, connected). */
  bonus_children_count: number;
  bonus_program_completed_at: string | null;
  /**
   * Derived: nanny has completed bonus contributions setup.
   * TRUE when EITHER nannies.bonus_program_completed_at is set OR
   * bonus_children_count > 0 (defensive against unapplied T-022 migration).
   */
  contributions_complete_derived: boolean;
  contact_state: NannyContactState | null;
  total_contacts_derived: number;
  responded_ever_derived: boolean;
  /**
   * T-023 lead signal — nanny currently nannies an under-3 child OUTSIDE
   * Baby Bloom. Sourced from `nanny_leads.lead_signals.external_u3_position`.
   * Null when unknown (no nanny_leads row OR signal key absent).
   */
  external_u3_position: boolean | null;
}

// ── Filter + sort + worklist state (drives URLSearchParams) ──

// Tri-state for verification filter chips.
export type TriState = "any" | "has" | "missing";

// Tri-state for contributions filter.
export type ContributionsFilter = "any" | "complete" | "incomplete";

// Tri-state for responded filter.
export type RespondedFilter = "any" | "yes" | "no";

export const WORKLIST_TABS = [
  "worklist",
  "never_contacted",
  "snoozed_today",
  "cold_7d",
  "verification_stuck",
  "responded",
  "activated",
  "dormant",
  "all",
] as const;
export type WorklistTab = (typeof WORKLIST_TABS)[number];

export const LEAD_SORTS = [
  "signup_newest",
  "signup_oldest",
  "last_contact_recent",
  "last_contact_never_first",
  "total_contacts_desc",
  "next_action_soonest",
  "children_desc",
  "children_asc",
  "linked_children_desc",
  "linked_children_asc",
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export interface LeadFilters {
  tab: WorklistTab;
  wwcc: TriState;
  gov_id: TriState;
  photo: TriState;
  abn: TriState;
  /**
   * Tri-state for T-023 external_u3_position lead signal.
   * - `has` = nanny currently nannies an under-3 outside BB
   * - `missing` = explicitly false OR signal unknown
   * - `any` = no filter
   */
  external_u3: TriState;
  /** Tri-state: any / has (≥1 child on account) / missing (zero children). */
  children: TriState;
  /** Tri-state: any / has (≥1 parent-linked child) / missing (zero parent-linked). */
  linked_children: TriState;
  level: number[]; // multi-select of verification_level values
  contributions: ContributionsFilter;
  status: LeadStatus[]; // multi-select
  suburb: string | null;
  responded: RespondedFilter;
  search: string | null;
}

export interface LeadQueryState {
  filters: LeadFilters;
  sort: LeadSort;
  page: number; // 1-based
  pageSize: number;
}

// ── Server action envelope ──

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Activity timeline (composed in JS, not a Postgres view) ──

export type TimelineEventCategory =
  | "signup"
  | "profile"
  | "verification"
  | "position"
  | "babysitting"
  | "placement"
  | "payout"
  | "subscription"
  | "child"
  | "consent"
  | "email"
  | "admin"
  | "other";

export interface TimelineEvent {
  event_at: string; // ISO timestamp
  category: TimelineEventCategory;
  title: string;
  detail: string | null;
  source: string; // table or log name for debugging
  link_url?: string;
}
