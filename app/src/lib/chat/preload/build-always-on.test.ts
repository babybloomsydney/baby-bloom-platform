import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildSummary } from "@/lib/chat/context";
import { buildAlwaysOnContext } from "./build-always-on";

/**
 * Per `Latency:Efficiency/07-test-plan.md §WU5`:
 *
 * 1. Returns partial PreloadedContext with the four always-on slots.
 *    Demoted slots (connection_inbox, verification_status) NOT populated.
 * 2. children_profiles: one entry per child in scope.
 * 3. children_recent_feeds: one entry per child, capped at 10 items.
 * 4. All underlying fetches run in parallel.
 * 5. Server-built data passes verifyPreload cleanly.
 * 6. One fetch throwing → that slot omitted, others survive (fail-open per slot).
 * 7. No children → children_profiles is empty array, slot still populated.
 */

const oliver: ChildSummary = {
  id: "child-oliver",
  firstName: "Oliver",
  ageMonths: 18,
  ageBracket: "12-18m",
  gender: "male",
};
const lily: ChildSummary = {
  id: "child-lily",
  firstName: "Lily",
  ageMonths: 8,
  ageBracket: "6-12m",
  gender: "female",
};

interface MockState {
  childClientRows: Array<{
    id: string;
    first_name: string;
    date_of_birth: string;
    gender: string | null;
    under_three: boolean;
    status: string;
  }>;
  bappLogsByChild: Map<
    string,
    Array<{
      id: string;
      child_client_id: string;
      author_id: string;
      type: string;
      status: string;
      context: string;
      created_at: string;
      data: Record<string, unknown>;
      is_active: boolean;
    }>
  >;
  agentMemoryRows: Array<{
    id: string;
    scope: "account" | "child" | "shared";
    child_client_id: string | null;
    content: string;
    updated_at: string;
    is_active: boolean;
  }>;
  userProfilesRow: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  // Force errors for fail-open testing.
  forceErrorOn: Set<string>;
  // Track parallelism — start times per query for the timing test.
  startTimes: Record<string, number>;
}

const state: MockState = {
  childClientRows: [],
  bappLogsByChild: new Map(),
  agentMemoryRows: [],
  userProfilesRow: null,
  forceErrorOn: new Set(),
  startTimes: {},
};

beforeEach(() => {
  state.childClientRows = [];
  state.bappLogsByChild = new Map();
  state.agentMemoryRows = [];
  state.userProfilesRow = null;
  state.forceErrorOn = new Set();
  state.startTimes = {};
});

function makeSupabase(): SupabaseClient {
  const recordStart = (name: string) => {
    state.startTimes[name] = Date.now();
  };
  const maybeReject = async <T>(
    name: string,
    value: T,
    delay = 25,
  ): Promise<T> => {
    recordStart(name);
    if (state.forceErrorOn.has(name)) {
      // Real Promise rejection — propagates cleanly through await.
      throw new Error(`forced error on ${name}`);
    }
    await new Promise((r) => setTimeout(r, delay));
    return value;
  };
  return {
    from: (table: string) => {
      if (table === "child_client") {
        return {
          select: () => ({
            in: () =>
              maybeReject("child_client", {
                data: state.childClientRows,
                error: null,
              }),
          }),
        };
      }
      if (table === "bapp_logs") {
        // New shape: per-child Promise.all queries chain
        // .select(cols).eq("child_client_id", id).eq("is_active", true).order(...).limit(N)
        return {
          select: () => ({
            eq: (col: string, value: string) => ({
              eq: () => ({
                order: () => ({
                  limit: (n: number) =>
                    maybeReject("bapp_logs", {
                      data:
                        col === "child_client_id"
                          ? (state.bappLogsByChild.get(value) ?? []).slice(0, n)
                          : [],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "agent_memory") {
        // New chain: .select(cols).eq("bloombot_id", botId).or(...).eq("is_active", true).order(...).limit(N)
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      maybeReject("agent_memory", {
                        data: state.agentMemoryRows,
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "user_profiles") {
        // Two consumers:
        //   - fetchMyProfileBasics: select("first_name, last_name").eq("user_id", id).maybeSingle()
        //   - fetchChildRecentFeeds (author-name lookup): select("user_id, first_name").in("user_id", [...])
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                maybeReject("user_profiles", {
                  data: state.userProfilesRow,
                  error: null,
                }),
            }),
            // Author-name batch lookup. Tests don't seed any author
            // profile rows, so return an empty array — items still
            // populate, just with author_name fallback "User".
            in: () =>
              maybeReject("user_profiles_authors", {
                data: [],
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unmocked table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("buildAlwaysOnContext", () => {
  it("returns the four always-on slots; does NOT populate demoted slots", async () => {
    state.childClientRows = [
      {
        id: oliver.id,
        first_name: "Oliver",
        date_of_birth: "2024-11-08",
        gender: "male",
        under_three: true,
        status: "active",
      },
    ];
    state.userProfilesRow = { first_name: "Emma", last_name: "Smith" };
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver],
      supabase: makeSupabase(),
    });
    expect(out.children_profiles).toBeDefined();
    expect(out.children_recent_feeds).toBeDefined();
    expect(out.recent_agent_memory).toBeDefined();
    expect(out.my_profile_basics).toBeDefined();
    // Demoted slots — must NOT appear.
    expect(out.connection_inbox).toBeUndefined();
    expect(out.verification_status).toBeUndefined();
  });

  it("children_profiles has one entry per child in scope", async () => {
    state.childClientRows = [
      {
        id: oliver.id,
        first_name: "Oliver",
        date_of_birth: "2024-11-08",
        gender: "male",
        under_three: true,
        status: "active",
      },
      {
        id: lily.id,
        first_name: "Lily",
        date_of_birth: "2025-09-08",
        gender: "female",
        under_three: true,
        status: "active",
      },
    ];
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver, lily],
      supabase: makeSupabase(),
    });
    expect(out.children_profiles).toHaveLength(2);
    const names = out.children_profiles?.map((p) => p.profile.first_name);
    expect(names).toContain("Oliver");
    expect(names).toContain("Lily");
  });

  it("children_recent_feeds caps each child at 10 items", async () => {
    // Stuff 25 items for Oliver. Builder should cap at 10.
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: `log-${i}`,
      child_client_id: oliver.id,
      author_id: "u1",
      type: "diary",
      status: "completed",
      context: "adhoc",
      // Newer = higher index; the cap should keep i = 24..15.
      created_at: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      data: { note: `entry ${i}` },
      is_active: true,
    }));
    state.bappLogsByChild.set(oliver.id, items);
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver],
      supabase: makeSupabase(),
    });
    expect(out.children_recent_feeds).toHaveLength(1);
    expect(out.children_recent_feeds?.[0].items).toHaveLength(10);
  });

  it("runs the underlying fetches in parallel", async () => {
    state.childClientRows = [
      {
        id: oliver.id,
        first_name: "Oliver",
        date_of_birth: "2024-11-08",
        gender: "male",
        under_three: true,
        status: "active",
      },
    ];
    state.userProfilesRow = { first_name: "Emma", last_name: null };
    await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver],
      supabase: makeSupabase(),
    });
    const starts = Object.values(state.startTimes);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    // All start times should fall within ~30ms of each other (parallel).
    const spread = Math.max(...starts) - Math.min(...starts);
    expect(spread).toBeLessThan(30);
  });

  it("one fetch throwing → that slot omitted, others survive", async () => {
    state.childClientRows = [
      {
        id: oliver.id,
        first_name: "Oliver",
        date_of_birth: "2024-11-08",
        gender: "male",
        under_three: true,
        status: "active",
      },
    ];
    state.userProfilesRow = { first_name: "Emma", last_name: null };
    state.forceErrorOn.add("agent_memory");
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver],
      supabase: makeSupabase(),
    });
    // The errored slot is omitted; the others survive.
    expect(out.recent_agent_memory).toBeUndefined();
    expect(out.children_profiles).toBeDefined();
    expect(out.my_profile_basics).toBeDefined();
  });

  it("no children → children_profiles is empty array (slot still populated)", async () => {
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [],
      supabase: makeSupabase(),
    });
    expect(out.children_profiles).toEqual([]);
    expect(out.children_recent_feeds).toEqual([]);
  });

  it("agent_memory rows mapped: account → user, shared → shared_child", async () => {
    state.agentMemoryRows = [
      {
        id: "m1",
        scope: "account",
        child_client_id: null,
        content: "owner-key: owner-value",
        updated_at: "2026-05-09T08:00:00Z",
        is_active: true,
      },
      {
        id: "m2",
        scope: "shared",
        child_client_id: oliver.id,
        content: "shared-key: shared-value",
        updated_at: "2026-05-09T09:00:00Z",
        is_active: true,
      },
    ];
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [oliver],
      supabase: makeSupabase(),
    });
    expect(out.recent_agent_memory).toBeDefined();
    const items = out.recent_agent_memory?.items ?? [];
    expect(items.find((i) => i.value === "owner-value")?.scope).toBe("user");
    expect(items.find((i) => i.value === "shared-value")?.scope).toBe(
      "shared_child",
    );
    expect(items.find((i) => i.value === "shared-value")?.child_id).toBe(
      oliver.id,
    );
  });

  it("my_profile_basics carries server-known role, not client-supplied", async () => {
    state.userProfilesRow = { first_name: "Emma", last_name: null };
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [],
      supabase: makeSupabase(),
    });
    expect(out.my_profile_basics?.role).toBe("nanny");
    expect(out.my_profile_basics?.first_name).toBe("Emma");
  });

  it("user_profiles missing → my_profile_basics omitted (fail-open)", async () => {
    state.userProfilesRow = null;
    const out = await buildAlwaysOnContext({
      userId: "00000000-0000-4000-8000-000000000001",
      botId: "00000000-0000-4000-8000-000000000bot",
      role: "nanny",
      children: [],
      supabase: makeSupabase(),
    });
    expect(out.my_profile_basics).toBeUndefined();
  });
});
