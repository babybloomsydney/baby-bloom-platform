/**
 * Server-side always-on pre-load builder (Latency:Efficiency build, WU5).
 *
 * Per amendment 2026-05-09 (D-04), the always-on slots are
 * child-data-first: every accessible child's profile + recent feed,
 * plus recent agent memory + my profile basics. `connection_inbox`
 * and `verification_status` are demoted to surface-scoped (not
 * populated by this builder; the inbox/verification page
 * publishers fill them when relevant).
 *
 * Failure model: fail-open per slot. A throwing fetch logs and omits
 * its slot; sibling slots survive. The route's verifier accepts
 * whatever this builder produces (no per-slot re-verification needed
 * — server-built data is verified-by-construction).
 *
 * Spec: system/APP/BLOOMBOT/Latency:Efficiency/06-implementation-plan.md §WU5
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildSummary } from "@/lib/chat/context";
import type { BotRole } from "@/lib/ai/model-selector";
import type { ChildClient, FeedItem } from "@/types/bapp";
import type { PreloadedContext } from "./types";

const RECENT_FEED_CAP = 10;
const RECENT_MEMORY_CAP = 5;
/** Threshold for treating "key: value" content as a key-value pair
 *  rather than a single-line value. Anything over this is treated
 *  as opaque content and rendered whole. */
const MEMORY_KEY_MAX_LENGTH = 60;

export interface BuildAlwaysOnInput {
  /** The user's auth id (used for user_profiles lookup). */
  userId: string;
  /** The user's bot id. Required for `agent_memory` scoping —
   *  account-scope rows must be filtered to this bot to prevent
   *  cross-user memory leakage. */
  botId: string;
  role: BotRole;
  /** Children the user has access to — already loaded server-side
   *  via getUserChildren() before this builder runs. */
  children: ChildSummary[];
  /** Service-role admin client. Server builder is authoritative —
   *  it doesn't need RLS to filter, just batches reads efficiently. */
  supabase: SupabaseClient;
}

/**
 * Returns a partial PreloadedContext with every always-on slot the
 * fetch was able to fulfill. Slots whose fetch threw are omitted
 * (fail-open). The `as_of` timestamp stamps the moment the build
 * started — used by the renderer for per-block freshness display.
 */
export async function buildAlwaysOnContext(
  input: BuildAlwaysOnInput,
): Promise<PreloadedContext> {
  const out: PreloadedContext = { as_of: new Date().toISOString() };
  const childIds = input.children.map((c) => c.id);

  // All four fetches run in parallel — wall time is bounded by the
  // slowest call, not the sum.
  const [profilesResult, feedsResult, memoryResult, profileResult] =
    await Promise.allSettled([
      fetchChildProfiles(input.supabase, childIds),
      fetchChildRecentFeeds(input.supabase, childIds),
      fetchRecentAgentMemory(input.supabase, input.botId, childIds),
      fetchMyProfileBasics(input.supabase, input.userId, input.role),
    ]);

  // ── children_profiles ──
  if (profilesResult.status === "fulfilled") {
    out.children_profiles = profilesResult.value;
  } else {
    console.warn(
      "[buildAlwaysOnContext] children_profiles fetch failed; slot omitted:",
      profilesResult.reason,
    );
  }

  // ── children_recent_feeds ──
  if (feedsResult.status === "fulfilled") {
    out.children_recent_feeds = feedsResult.value;
  } else {
    console.warn(
      "[buildAlwaysOnContext] children_recent_feeds fetch failed; slot omitted:",
      feedsResult.reason,
    );
  }

  // ── recent_agent_memory ──
  if (memoryResult.status === "fulfilled") {
    out.recent_agent_memory = memoryResult.value;
  } else {
    console.warn(
      "[buildAlwaysOnContext] recent_agent_memory fetch failed; slot omitted:",
      memoryResult.reason,
    );
  }

  // ── my_profile_basics ──
  if (profileResult.status === "fulfilled" && profileResult.value) {
    out.my_profile_basics = profileResult.value;
  } else if (profileResult.status === "rejected") {
    console.warn(
      "[buildAlwaysOnContext] my_profile_basics fetch failed; slot omitted:",
      profileResult.reason,
    );
  }

  return out;
}

// ── fetchers ──

type ChildProfileEntry = NonNullable<
  PreloadedContext["children_profiles"]
>[number];

async function fetchChildProfiles(
  supabase: SupabaseClient,
  childIds: string[],
): Promise<ChildProfileEntry[]> {
  if (childIds.length === 0) return [];
  const { data, error } = await supabase
    .from("child_client")
    .select("id, first_name, date_of_birth, gender, under_three, status")
    .in("id", childIds);
  if (error) throw error;
  if (!data) return [];
  type Row = Pick<
    ChildClient,
    "id" | "first_name" | "date_of_birth" | "gender" | "under_three" | "status"
  >;
  return (data as Row[]).map((row) => ({
    child_id: row.id,
    profile: {
      id: row.id,
      first_name: row.first_name,
      date_of_birth: row.date_of_birth,
      gender: row.gender,
      under_three: row.under_three,
      status: row.status,
    },
  }));
}

type ChildFeedEntry = NonNullable<
  PreloadedContext["children_recent_feeds"]
>[number];

/**
 * Fields the renderer + downstream consumers actually use. Avoids
 * `select("*")` which would transfer wide JSONB / metadata columns
 * unnecessarily and silently inflate the wire payload as schema
 * grows.
 *
 * `author_name` is intentionally NOT here — it's NOT a column on
 * `bapp_logs` (verified by the prior 42703 error). It's derived by
 * joining `user_profiles.first_name` on `author_id`, matching how
 * `lib/actions/bapp/feed.ts` assembles its FeedItem[].
 */
const FEED_ITEM_COLUMNS = [
  "id",
  "child_client_id",
  "author_id",
  "type",
  "status",
  "context",
  "data",
  "created_at",
  "updated_at",
  "is_active",
  "parent_log_id",
].join(",");

async function fetchChildRecentFeeds(
  supabase: SupabaseClient,
  childIds: string[],
): Promise<ChildFeedEntry[]> {
  if (childIds.length === 0) return [];
  // Per-child capped queries in parallel. Bounds wire transfer to
  // exactly N children × RECENT_FEED_CAP rows total — even when a
  // single child has 1000s of historical entries. Trade-off: N
  // round-trips instead of 1, but PostgreSQL's per-child index hit
  // (child_client_id, is_active, created_at DESC) makes each query
  // O(log + cap) and Supabase JS pools requests via HTTP/2.
  //
  // Typical user has 1-3 children; edge case 5-7. At worst 7
  // parallel requests is well within Supabase's pgBouncer pool.
  // Net latency is bounded by the slowest single fetch.
  type FeedRow = {
    id: string;
    child_client_id: string;
    author_id: string | null;
    type: string;
    status: string;
    context: string | null;
    data: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    is_active: boolean;
    parent_log_id: string | null;
  };
  const perChildResults = await Promise.all(
    childIds.map(async (childId) => {
      const { data, error } = await supabase
        .from("bapp_logs")
        .select(FEED_ITEM_COLUMNS)
        .eq("child_client_id", childId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(RECENT_FEED_CAP);
      if (error) throw error;
      return {
        child_id: childId,
        rows: (data ?? []) as unknown as FeedRow[],
      };
    }),
  );

  // Batch author-name lookup — collect every distinct author_id
  // across all children's rows and resolve to user_profiles.first_name
  // in ONE query. Mirrors the pattern in lib/actions/bapp/feed.ts so
  // wire shape matches what consumers (renderer + downstream) expect.
  const allAuthorIds = Array.from(
    new Set(
      perChildResults
        .flatMap((r) => r.rows.map((row) => row.author_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const authorNameById = new Map<string, string>();
  if (allAuthorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("user_id, first_name")
      .in("user_id", allAuthorIds);
    if (profilesError) throw profilesError;
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      first_name: string | null;
    }>) {
      authorNameById.set(p.user_id, p.first_name ?? "User");
    }
  }

  return perChildResults.map(({ child_id, rows }) => ({
    child_id,
    items: rows.map((row) => ({
      ...row,
      author_name: row.author_id
        ? (authorNameById.get(row.author_id) ?? "User")
        : "User",
    })) as unknown as FeedItem[],
  }));
}

async function fetchRecentAgentMemory(
  supabase: SupabaseClient,
  botId: string,
  childIds: string[],
): Promise<NonNullable<PreloadedContext["recent_agent_memory"]>> {
  // Account-scope rows MUST be filtered by bloombot_id to prevent
  // cross-user memory leakage — service-role admin client bypasses
  // RLS, so without this filter scope.eq.account would return any
  // user's account-scope memories.
  //
  // `child` scope is bot-private and intentionally excluded
  // (matches the existing buildMemoryTable pattern). `shared` scope
  // is included for children in this user's access scope.
  const sharedClause =
    childIds.length > 0
      ? `and(scope.eq.shared,child_client_id.in.(${childIds.join(",")}))`
      : null;
  const accountClause = `scope.eq.account`;
  const orExpr = sharedClause
    ? `${accountClause},${sharedClause}`
    : accountClause;

  const { data, error } = await supabase
    .from("agent_memory")
    .select("id, scope, child_client_id, content, updated_at")
    .eq("bloombot_id", botId) // ← scopes account-rows to this user's bot
    .or(orExpr)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(RECENT_MEMORY_CAP);
  if (error) throw error;
  type Row = {
    id: string;
    scope: "account" | "child" | "shared";
    child_client_id: string | null;
    content: string;
    updated_at: string;
  };
  const rows = (data as Row[]) ?? [];
  // Always populate the slot — empty `items: []` is more useful in the
  // runtime context than an absent slot (Katie sees "you have no recent
  // memories yet" rather than nothing). Consistent with how
  // `children_profiles` returns `[]` for users with no children.
  return {
    items: rows.map((r) => {
      // Wire format scope ∈ "user" | "shared_child"; map from DB scope.
      const wireScope: "user" | "shared_child" =
        r.scope === "account" ? "user" : "shared_child";
      return {
        // The DB stores a single `content` blob. The wire format
        // splits key/value but we don't have that split here — use
        // empty key + content as value, or split on first ':' if the
        // content follows the key:value convention. Empirically,
        // existing memory rows use "key: value" prose form.
        key: deriveMemoryKey(r.content),
        value: deriveMemoryValue(r.content),
        scope: wireScope,
        child_id:
          wireScope === "shared_child"
            ? (r.child_client_id ?? undefined)
            : undefined,
        updated_at: r.updated_at,
      };
    }),
  };
}

function deriveMemoryKey(content: string): string {
  const idx = content.indexOf(":");
  if (idx < 0 || idx > MEMORY_KEY_MAX_LENGTH) return "memory";
  return content.slice(0, idx).trim();
}

function deriveMemoryValue(content: string): string {
  const idx = content.indexOf(":");
  if (idx < 0 || idx > MEMORY_KEY_MAX_LENGTH) return content;
  return content.slice(idx + 1).trim();
}

async function fetchMyProfileBasics(
  supabase: SupabaseClient,
  userId: string,
  role: BotRole,
): Promise<PreloadedContext["my_profile_basics"] | undefined> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("first_name, last_name")
    .eq("user_id", userId)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>();
  if (error) throw error;
  if (!data) return undefined;
  return {
    first_name: data.first_name ?? "",
    last_name: data.last_name,
    role,
  };
}
