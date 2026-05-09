/**
 * Wire-format pre-loaded context shipped from page → chat client →
 * /api/chat. Every slot is optional. Slots are scoped to a single
 * entity (child_id, connection_id, etc.).
 *
 * Slots carry an `as_of` timestamp on the top-level payload so the
 * route can drop the whole payload when stale (default 30s window —
 * see `MAX_PRELOAD_AGE_SECONDS` in `verify.ts`).
 *
 * Per amendment 2026-05-09: child data is array-shaped (one entry
 * per accessible child) and is the always-on focus. Connection inbox
 * and verification status are demoted to surface-scoped (only loaded
 * when on the inbox / verification page).
 *
 * Spec: system/APP/BLOOMBOT/Latency:Efficiency/04-data-contracts.md §1
 */

import type { ChildClient, FeedItem } from "@/types/bapp";

export interface PreloadedContext {
  /** ISO8601 — applied to all slots in this payload. */
  as_of?: string;

  // ── Always-on (server-side fetches every turn for ALL accessible
  //    children; client may also publish fresher data for the current
  //    child being viewed — client wins on overlapping child_id per
  //    the merge rule in 04-data-contracts.md §5). ──

  /**
   * One entry per child the user has access to via getUserChildren.
   * Verified per-entry; bad entries are dropped individually, not
   * the whole slot.
   */
  children_profiles?: Array<{
    child_id: string;
    profile: Pick<
      ChildClient,
      | "id"
      | "first_name"
      | "date_of_birth"
      | "gender"
      | "under_three"
      | "status"
    >;
  }>;

  /**
   * One entry per child. items capped at last 10 bapp_logs (publisher
   * + always-on builder enforce the cap).
   */
  children_recent_feeds?: Array<{
    child_id: string;
    items: FeedItem[];
  }>;

  recent_agent_memory?: {
    items: Array<{
      key: string;
      value: string;
      scope: "user" | "shared_child";
      child_id?: string;
      updated_at: string;
    }>;
  };

  my_profile_basics?: {
    first_name: string;
    last_name: string | null;
    role: "nanny" | "parent" | "admin";
  };

  // ── Surface-scoped — present only when the user is on a surface
  //    that already has the data loaded, or that the server-side
  //    builder treats as relevant. ──

  my_placement?: {
    placement_id: string;
    summary: {
      partner_name: string;
      started_at: string;
      role: "nanny" | "parent";
    };
  };

  my_jobs?: {
    role: "parent";
    open_positions_count: number;
    summaries: Array<{ id: string; suburb: string; created_at: string }>;
  };

  my_job_matches?: {
    role: "parent";
    matches: Array<{ nanny_id: string; first_name: string; score: number }>;
  };

  connection_detail?: {
    connection_id: string;
    summary: {
      partner_name: string;
      stage: string;
      last_message_at: string | null;
    };
  };

  /**
   * Demoted from always-on (2026-05-09 amendment): only loaded when
   * the user is on the inbox page. Katie calls
   * `read_connection_inbox` if she needs the data on other pages.
   *
   * `recent` is optional because some surface-scoped publishers may
   * ship just the count (cheaper) while others ship the full detail.
   * Consumers must handle both shapes.
   *
   * Per code-reviewer HIGH on WU8, `recent[]` carries DISPLAY-only
   * fields — partner_name + received_at. Connection request IDs are
   * intentionally NOT in the wire format: the verifier doesn't
   * server-check connection ownership for this slot (it accepts the
   * publish on the assumption the page already filtered to the
   * user's own requests), so shipping IDs would create a latent
   * IDOR vector if a future tool consumed them to skip an ownership
   * check. Keep this slot data NARRATIVE-ONLY.
   */
  connection_inbox?: {
    pending_count: number;
    recent?: Array<{ partner_name: string; received_at: string }>;
  };

  /**
   * Demoted from always-on (2026-05-09 amendment): only loaded when
   * the user is on the verification page. Katie calls
   * `read_verification_status` if she needs the data on other pages.
   */
  verification_status?: {
    level: number;
    status_code: number;
    label: string;
    blocking_issues: string[];
  };
}

/**
 * Names of every slot in `PreloadedContext` (excluding `as_of`).
 * Used by the verifier to enumerate slots and by telemetry to
 * report which slots were received / dropped.
 */
export const PRELOAD_SLOT_NAMES = [
  "children_profiles",
  "children_recent_feeds",
  "recent_agent_memory",
  "my_profile_basics",
  "my_placement",
  "my_jobs",
  "my_job_matches",
  "connection_detail",
  "connection_inbox",
  "verification_status",
] as const satisfies ReadonlyArray<Exclude<keyof PreloadedContext, "as_of">>;

export type PreloadSlotName = (typeof PRELOAD_SLOT_NAMES)[number];
