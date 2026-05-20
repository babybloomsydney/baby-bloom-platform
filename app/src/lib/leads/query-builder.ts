// T-032 — URLSearchParams → typed LeadQueryState → Supabase filter chain.
// Server-side filter / sort / paginate so the list stays fast at thousands of rows.

import type {
  ContributionsFilter,
  LeadFilters,
  LeadQueryState,
  LeadSort,
  LeadStatus,
  RespondedFilter,
  TriState,
  WorklistTab,
} from "./types";
import { LEAD_SORTS, LEAD_STATUSES, WORKLIST_TABS } from "./types";

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_CHOICES = [25, 50, 100] as const;

const TRI_STATE_VALUES: readonly TriState[] = ["any", "has", "missing"];

function parseTriState(raw: string | null): TriState {
  if (raw && (TRI_STATE_VALUES as readonly string[]).includes(raw)) {
    return raw as TriState;
  }
  return "any";
}

function parseContributions(raw: string | null): ContributionsFilter {
  if (raw === "complete" || raw === "incomplete") return raw;
  return "any";
}

function parseResponded(raw: string | null): RespondedFilter {
  if (raw === "yes" || raw === "no") return raw;
  return "any";
}

function parseTab(raw: string | null): WorklistTab {
  if (raw && (WORKLIST_TABS as readonly string[]).includes(raw)) {
    return raw as WorklistTab;
  }
  // Default to "all" so first-load shows every signed-up nanny.
  // Operators can switch to "worklist" for the curated triage view.
  return "all";
}

function parseSort(raw: string | null): LeadSort {
  if (raw && (LEAD_SORTS as readonly string[]).includes(raw)) {
    return raw as LeadSort;
  }
  return "signup_newest";
}

function parseStatuses(raw: string | null): LeadStatus[] {
  if (!raw) return [];
  const requested = raw.split(",").map((s) => s.trim());
  return requested.filter((s): s is LeadStatus =>
    (LEAD_STATUSES as readonly string[]).includes(s),
  );
}

function parseLevels(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 4);
}

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function parsePageSize(raw: string | null): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  return (PAGE_SIZE_CHOICES as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

function parseSearch(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Cap search length to prevent abuse + giant ILIKE patterns.
  return trimmed.slice(0, 100);
}

function parseSuburb(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 100);
}

/**
 * Parse URL search params into a typed LeadQueryState. Unknown / malformed
 * values fall back to safe defaults; never throws.
 */
export function parseLeadQueryState(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
): LeadQueryState {
  const get = (key: string): string | null => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key);
    }
    const v = searchParams[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const filters: LeadFilters = {
    tab: parseTab(get("tab")),
    wwcc: parseTriState(get("wwcc")),
    gov_id: parseTriState(get("gov_id")),
    photo: parseTriState(get("photo")),
    abn: parseTriState(get("abn")),
    external_u3: parseTriState(get("external_u3")),
    level: parseLevels(get("level")),
    contributions: parseContributions(get("contributions")),
    status: parseStatuses(get("status")),
    suburb: parseSuburb(get("suburb")),
    responded: parseResponded(get("responded")),
    search: parseSearch(get("search")),
  };

  return {
    filters,
    sort: parseSort(get("sort")),
    page: parsePage(get("page")),
    pageSize: parsePageSize(get("page_size")),
  };
}

/**
 * Serialise the state back into URLSearchParams so the client can construct
 * canonical URLs (toggle a filter chip → push new search string).
 */
export function serialiseLeadQueryState(
  state: LeadQueryState,
): URLSearchParams {
  const params = new URLSearchParams();

  // Default tab is "all" — only serialise non-default tab into the URL.
  if (state.filters.tab !== "all") {
    params.set("tab", state.filters.tab);
  }
  if (state.filters.wwcc !== "any") params.set("wwcc", state.filters.wwcc);
  if (state.filters.gov_id !== "any")
    params.set("gov_id", state.filters.gov_id);
  if (state.filters.photo !== "any") params.set("photo", state.filters.photo);
  if (state.filters.abn !== "any") params.set("abn", state.filters.abn);
  if (state.filters.external_u3 !== "any") {
    params.set("external_u3", state.filters.external_u3);
  }
  if (state.filters.level.length > 0) {
    params.set("level", state.filters.level.join(","));
  }
  if (state.filters.contributions !== "any") {
    params.set("contributions", state.filters.contributions);
  }
  if (state.filters.status.length > 0) {
    params.set("status", state.filters.status.join(","));
  }
  if (state.filters.suburb) params.set("suburb", state.filters.suburb);
  if (state.filters.responded !== "any") {
    params.set("responded", state.filters.responded);
  }
  if (state.filters.search) params.set("search", state.filters.search);
  if (state.sort !== "signup_newest") params.set("sort", state.sort);
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("page_size", String(state.pageSize));
  }

  return params;
}

// ── WHERE clause helpers exposed as pure data (for testability) ──

export interface PostgrestFilter {
  column: string;
  op:
    | "eq"
    | "is"
    | "in"
    | "gte"
    | "lte"
    | "lt"
    | "gt"
    | "not_is"
    | "not_eq"
    | "or_ilike_any";
  value: unknown;
}

/**
 * Translate filter state into a flat list of Postgrest filter operations.
 * Pure function — easy to unit-test. The Supabase chain builder applies these.
 */
export function buildFilterOps(state: LeadQueryState): PostgrestFilter[] {
  const ops: PostgrestFilter[] = [];
  const { filters } = state;

  // Verification dimensions (tri-state).
  // `verifications` is a related table; we filter via `.eq('verifications.column', value)`.
  if (filters.wwcc === "has") {
    ops.push({ column: "verifications.wwcc_verified", op: "eq", value: true });
  } else if (filters.wwcc === "missing") {
    // missing = NOT (wwcc_verified IS TRUE). Use `is.distinct.from` semantics
    // via two ops would be brittle; simpler: filter for FALSE OR NULL.
    ops.push({
      column: "verifications.wwcc_verified",
      op: "not_is",
      value: true,
    });
  }

  if (filters.gov_id === "has") {
    ops.push({
      column: "verifications.identity_verified",
      op: "eq",
      value: true,
    });
  } else if (filters.gov_id === "missing") {
    ops.push({
      column: "verifications.identity_verified",
      op: "not_is",
      value: true,
    });
  }

  // Photo (on user_profiles.profile_picture_url).
  if (filters.photo === "has") {
    ops.push({
      column: "user_profiles.profile_picture_url",
      op: "not_is",
      value: null,
    });
  } else if (filters.photo === "missing") {
    ops.push({
      column: "user_profiles.profile_picture_url",
      op: "is",
      value: null,
    });
  }

  // ABN (on nannies).
  if (filters.abn === "has") {
    ops.push({ column: "abn", op: "not_is", value: null });
  } else if (filters.abn === "missing") {
    ops.push({ column: "abn", op: "is", value: null });
  }

  // verification_level (on nannies, multi-select).
  if (filters.level.length > 0) {
    ops.push({ column: "verification_level", op: "in", value: filters.level });
  }

  // Contributions setup (derived from nannies.bonus_program_completed_at).
  if (filters.contributions === "complete") {
    ops.push({
      column: "bonus_program_completed_at",
      op: "not_is",
      value: null,
    });
  } else if (filters.contributions === "incomplete") {
    ops.push({ column: "bonus_program_completed_at", op: "is", value: null });
  }

  // Lead status (multi-select, on nanny_contact_state).
  if (filters.status.length > 0) {
    // Special case: if 'untouched' is in the selection, we also want to include
    // rows with NO contact_state (LEFT JOIN returns null). The page-level
    // assembly handles untouched-default; here we filter the joined column.
    ops.push({
      column: "nanny_contact_state.lead_status",
      op: "in",
      value: filters.status,
    });
  }

  // Suburb (on user_profiles).
  if (filters.suburb) {
    ops.push({
      column: "user_profiles.suburb",
      op: "eq",
      value: filters.suburb,
    });
  }

  // Responded — derived from inbound contact existence. Handled at assembly
  // time because Supabase's nested aggregate filter is awkward; we filter the
  // result set after derived computation. Push a hint op so the caller knows.
  if (filters.responded !== "any") {
    ops.push({
      column: "__derived_responded__",
      op: "eq",
      value: filters.responded === "yes",
    });
  }

  // Search across name / email / mobile_number on user_profiles.
  if (filters.search) {
    ops.push({
      column: "user_profiles",
      op: "or_ilike_any",
      value: {
        columns: ["first_name", "last_name", "email", "mobile_number"],
        pattern: filters.search,
      },
    });
  }

  return ops;
}

// ── Sort helper ──

export interface SortSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
}

export function buildSortSpec(sort: LeadSort): SortSpec {
  switch (sort) {
    case "signup_newest":
      return { column: "created_at", ascending: false };
    case "signup_oldest":
      return { column: "created_at", ascending: true };
    case "last_contact_recent":
      return {
        column: "last_contact_at",
        ascending: false,
        nullsFirst: false,
        foreignTable: "nanny_contact_state",
      };
    case "last_contact_never_first":
      return {
        column: "last_contact_at",
        ascending: true,
        nullsFirst: true,
        foreignTable: "nanny_contact_state",
      };
    case "total_contacts_desc":
      // Derived value — we'll sort in-app after pagination if needed; for the
      // initial query, fall back to signup_newest. Marked separately.
      return { column: "created_at", ascending: false };
    case "next_action_soonest":
      return {
        column: "next_action_at",
        ascending: true,
        nullsFirst: false,
        foreignTable: "nanny_contact_state",
      };
  }
}

// ── Pagination helper ──

export function paginationRange(state: LeadQueryState): {
  from: number;
  to: number;
} {
  const from = (state.page - 1) * state.pageSize;
  const to = from + state.pageSize - 1;
  return { from, to };
}
