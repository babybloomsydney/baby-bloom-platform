// Pure display-derivation helpers for the admin Positions lifecycle view (T-047).
// No DB calls, no side effects — all logic is derived from data the page already fetches.
// Kept local to the positions feature so nothing else in the codebase changes.
import { POSITION_STATUS, CONNECTION_STAGE } from "@/lib/position/constants";

// ─── DFY tiers ───
// 'priority' is BAI's "Advanced". Thresholds mirror DFY_TIERS[tier].maxRespondents in
// src/lib/matching/constants.ts — duplicated (not imported) to keep this change isolated to
// admin/positions. If those thresholds ever change, update them here too.
export type DfyTier = "standard" | "priority";
const DFY_MAX_RESPONDENTS: Record<DfyTier, number> = {
  standard: 5,
  priority: 10,
};
function normalizeTier(tier: string | null): DfyTier {
  return tier === "priority" ? "priority" : "standard";
}

// ─── Shared data shapes (consumed by page.tsx assembly + the panels) ───

export interface DfyMatchRow {
  nanny_id: string;
  nanny_user_id: string | null;
  nanny_name: string;
  suburb: string | null;
  status: string; // pending_wave | notified | viewed | interested | declined | expired
  wave: number | null;
  match_score: number | null;
  distance_km: number | null;
  notified_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  connection_id: string | null;
  connection_stage: number | null;
}

export interface ActivePlacement {
  nanny_id: string;
  nanny_user_id: string | null;
  nanny_name: string;
  hired_at: string | null;
  start_date: string | null;
  weekly_hours: number | null;
  hourly_rate: number | null;
}

export interface PerStageCounts {
  matched: number;
  invited: number;
  applied: number;
  accepted: number;
  meet: number;
  trial: number;
  offered: number;
  placed: number;
}

export type DfyState =
  | { kind: "none" }
  | { kind: "active"; tier: DfyTier; expiresAt: string | null }
  | { kind: "expired"; tier: DfyTier; expiredAt: string }
  | { kind: "completed"; tier: DfyTier }
  | { kind: "ended_user" }
  | { kind: "ended_system"; filledAt: string | null };

// Structural inputs — so this module does not depend on page.tsx's interfaces.
export interface DfyStateInput {
  dfy_activated_at: string | null;
  dfy_expires_at: string | null;
  position_status: number | null;
  filled_by_nanny_id: string | null;
  filled_at: string | null; // real placement date — surfaced on the ended_system state
  dfy_tier: string | null;
  dfyMatches: ReadonlyArray<{ status: string }>;
}

export interface ConnRow {
  connection_stage: number | null;
  source: string | null;
  created_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  intro_outcome_reported_at: string | null;
  trial_reported_at: string | null;
}

// ─── Helpers ───

/**
 * Derive the admin-facing DFY state. `none` (never activated) wins first; then the
 * terminal position states (ended/filled) trump the active/expired date logic.
 * `now` is injectable for deterministic tests.
 */
export function deriveDfyState(
  pos: DfyStateInput,
  now: number = Date.now(),
): DfyState {
  if (pos.dfy_activated_at == null) return { kind: "none" };
  // >= 50 deliberately covers Ended (50–56) AND Closed (60–61): the position is terminal,
  // so DFY is over regardless of the expiry dates below. (UI renders neutral "DFY ended" text.)
  if (
    pos.position_status != null &&
    pos.position_status >= POSITION_STATUS.ENDED_NATURAL
  ) {
    return { kind: "ended_user" };
  }
  if (
    pos.position_status === POSITION_STATUS.ACTIVE &&
    pos.filled_by_nanny_id != null
  ) {
    return { kind: "ended_system", filledAt: pos.filled_at };
  }
  const tier = normalizeTier(pos.dfy_tier);
  const expiresAt = pos.dfy_expires_at;
  // Not yet expired: no expiry set, or expiry is still in the future.
  if (expiresAt == null || new Date(expiresAt).getTime() > now) {
    return { kind: "active", tier, expiresAt };
  }
  // expiresAt is a non-null past date → completed (enough interest) or plain expired.
  const interested = pos.dfyMatches.filter(
    (m) => m.status === "interested",
  ).length;
  if (interested >= DFY_MAX_RESPONDENTS[tier])
    return { kind: "completed", tier };
  return { kind: "expired", tier, expiredAt: expiresAt };
}

/** Count nannies at each pipeline stage for one position (DFY pre-stages + connection stages). */
export function connStagesLocal(
  conns: ReadonlyArray<Pick<ConnRow, "connection_stage">>,
  dfyMatches: ReadonlyArray<{ status: string }>,
): PerStageCounts {
  const inStage = (codes: readonly number[]): number =>
    conns.filter(
      (c) => c.connection_stage != null && codes.includes(c.connection_stage),
    ).length;
  return {
    matched: dfyMatches.filter((m) => m.status === "pending_wave").length,
    invited: dfyMatches.filter(
      (m) => m.status === "notified" || m.status === "viewed",
    ).length,
    applied: inStage([
      CONNECTION_STAGE.NANNY_APPLIED_PENDING,
      CONNECTION_STAGE.NANNY_APPLIED,
    ]),
    accepted: inStage([
      CONNECTION_STAGE.ACCEPTED_PENDING,
      CONNECTION_STAGE.ACCEPTED,
    ]),
    // includes AWAITING_RESPONSE(30) — met, awaiting the outcome (matches compute-snapshot's [21,30]).
    meet: inStage([
      CONNECTION_STAGE.INTRO_SCHEDULED,
      CONNECTION_STAGE.INTRO_COMPLETE,
      CONNECTION_STAGE.AWAITING_RESPONSE,
    ]),
    trial: inStage([
      CONNECTION_STAGE.TRIAL_ARRANGED,
      CONNECTION_STAGE.TRIAL_COMPLETE,
    ]),
    offered: inStage([CONNECTION_STAGE.OFFERED]),
    // confirmed (34, a transient handshake → 40) or active (40): the hire is locked in.
    placed: inStage([CONNECTION_STAGE.CONFIRMED, CONNECTION_STAGE.ACTIVE]),
  };
}

/**
 * Split a position's connections by origin. DFY is exact (`source='dfy'`).
 * Parent-Connect vs nanny-applied is BEST-EFFORT for `source=NULL` rows: born at stage 4/5 =
 * nanny-applied; stage 0 or advanced (≥10) with null source = assumed parent-initiated. Once a
 * nanny-applied row advances past stage 5 it can no longer be told apart and lands in
 * `parentInitiated` — a known limitation until the deferred `connection_origin` column lands
 * (see 03-deferred-and-findings.md §A).
 */
export function splitConnectionsByOrigin<
  T extends Pick<ConnRow, "connection_stage" | "source">,
>(
  conns: ReadonlyArray<T>,
): { parentInitiated: T[]; nannyApplied: T[]; dfy: T[] } {
  const parentInitiated: T[] = [];
  const nannyApplied: T[] = [];
  const dfy: T[] = [];
  for (const c of conns) {
    if (c.source === "dfy") {
      dfy.push(c);
    } else if (
      c.connection_stage === CONNECTION_STAGE.NANNY_APPLIED_PENDING ||
      c.connection_stage === CONNECTION_STAGE.NANNY_APPLIED
    ) {
      nannyApplied.push(c);
    } else {
      parentInitiated.push(c);
    }
  }
  return { parentInitiated, nannyApplied, dfy };
}

/** The real "entered this stage at" timestamp for a connection's CURRENT stage, or null if none exists. */
export function stageTimestamp(conn: ConnRow): string | null {
  switch (conn.connection_stage) {
    case CONNECTION_STAGE.REQUEST_SENT:
    case CONNECTION_STAGE.NANNY_APPLIED_PENDING:
    case CONNECTION_STAGE.NANNY_APPLIED:
      return conn.created_at;
    case CONNECTION_STAGE.ACCEPTED_PENDING:
    case CONNECTION_STAGE.ACCEPTED:
      return conn.responded_at; // may be null for nanny self-apply
    case CONNECTION_STAGE.INTRO_SCHEDULED:
      return conn.confirmed_at;
    case CONNECTION_STAGE.INTRO_COMPLETE:
      return conn.intro_outcome_reported_at;
    case CONNECTION_STAGE.TRIAL_ARRANGED:
      return conn.trial_reported_at;
    default:
      return null; // Awaiting/Offered/Confirmed/Active + terminals have no dedicated column
  }
}

/** Absolute Sydney-time label (AEST/AEDT-aware) for a UTC ISO string. */
export function formatSydneyTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Badge variants (shared by the table + the panels) ───

/**
 * The StatusBadge variant union used across the admin Positions surface. This mirrors a subset of
 * StatusBadge's own `StatusVariant` (it omits 'unattempted'); keep it in sync if that type changes.
 * (Not derived via import to keep this change isolated to admin/positions.)
 */
export type BadgeVariant =
  | "active"
  | "pending"
  | "verified"
  | "inactive"
  | "failed"
  | "info";

/** Connection stages held pending OCG clearance for a verification-level-3 nanny (badged "pending OCG"). */
export const HELD_CONNECTION_STAGES: number[] = [
  CONNECTION_STAGE.NANNY_APPLIED_PENDING,
  CONNECTION_STAGE.ACCEPTED_PENDING,
];

/** Map a connection stage to a StatusBadge variant (held variants 4/5/9 included). */
export function getConnectionStageBadgeVariant(
  stage: number | null,
): BadgeVariant {
  if (stage == null) return "inactive";
  if (stage === CONNECTION_STAGE.REQUEST_SENT) return "pending";
  if (
    stage === CONNECTION_STAGE.NANNY_APPLIED_PENDING ||
    stage === CONNECTION_STAGE.NANNY_APPLIED
  )
    return "info";
  if (
    stage === CONNECTION_STAGE.ACCEPTED_PENDING ||
    stage === CONNECTION_STAGE.ACCEPTED
  )
    return "info";
  if (
    (
      [
        CONNECTION_STAGE.INTRO_SCHEDULED,
        CONNECTION_STAGE.INTRO_COMPLETE,
        CONNECTION_STAGE.AWAITING_RESPONSE,
        CONNECTION_STAGE.TRIAL_ARRANGED,
        CONNECTION_STAGE.TRIAL_COMPLETE,
        CONNECTION_STAGE.OFFERED,
      ] as number[]
    ).includes(stage)
  ) {
    return "verified";
  }
  if (
    (
      [CONNECTION_STAGE.CONFIRMED, CONNECTION_STAGE.ACTIVE] as number[]
    ).includes(stage)
  )
    return "active";
  if (
    (
      [
        CONNECTION_STAGE.DECLINED,
        CONNECTION_STAGE.REQUEST_CANCELLED,
        CONNECTION_STAGE.NOT_HIRED,
        CONNECTION_STAGE.NOT_SELECTED,
        CONNECTION_STAGE.CANCELLED_BY_PARENT,
        CONNECTION_STAGE.CANCELLED_BY_NANNY,
      ] as number[]
    ).includes(stage)
  ) {
    return "failed";
  }
  return "inactive"; // REQUEST_EXPIRED, SCHEDULE_EXPIRED, INTRO_INCOMPLETE, FINISHED
}

/** Map a dfy_match_notifications status to a StatusBadge variant. */
export function dfyMatchStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "pending_wave":
      return "pending";
    case "notified":
    case "viewed":
      return "info";
    case "interested":
      return "verified";
    case "declined":
      return "failed";
    default:
      return "inactive"; // expired + anything unexpected
  }
}

/** Human label for a dfy_match_notifications status. */
export function dfyMatchStatusLabel(status: string): string {
  switch (status) {
    case "pending_wave":
      return "Matched";
    case "notified":
      return "Contacted";
    case "viewed":
      return "Viewed";
    case "interested":
      return "Interested";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}
