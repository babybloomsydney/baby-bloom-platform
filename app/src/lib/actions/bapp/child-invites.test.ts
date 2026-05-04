/**
 * Trimmed unit suite for the child-invite linking redesign.
 *
 * Scope discipline: 4 highest-failure-probability paths. The schema +
 * RLS + SECURITY DEFINER paths are covered by the Supabase
 * post-migration verification SQL (03b-post-migration-verify.sql) and
 * not re-tested here.
 *
 * 1. createChild rejects without guardian_permission_confirmed (AGR-14).
 * 2. connectChildInvite happy path translates RPC success to envelope.
 * 3. connectChildInvite maps SQLSTATE P0005 to "role_mismatch".
 * 4. removeNannyFromChild keeps the placement active when the
 *    (parent, nanny) pair still shares another child (06 §2 — the
 *    multi-children-per-placement edge case).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock state ────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  authUser: { id: "user-nanny-1", email: "nanny@example.com" } as {
    id: string;
    email: string;
  } | null,
  // Per-table fixtures.
  userRoles: [] as Array<{ user_id: string; role: string }>,
  childById: null as Record<string, unknown> | null,
  // Counters / capture for behaviour assertions.
  childInsertCalled: 0,
  inviteInsertCalled: 0,
  consentCalls: 0,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResponse: { data: null as unknown, error: null as unknown },
  // Multi-children placement-end fixture state.
  childUpdates: [] as Array<{ id: string; nanny_user_id: null | string }>,
  childCountForPair: 0,
  placementUpdates: [] as Array<Record<string, unknown>>,
  activeForNannyCount: 0,
  activeForParentCount: 0,
  nannyRow: null as { id: string } | null,
  parentRow: null as { id: string } | null,
  activityLogs: [] as Array<Record<string, unknown>>,
}));

beforeEach(() => {
  state.authUser = { id: "user-nanny-1", email: "nanny@example.com" };
  state.userRoles = [];
  state.childById = null;
  state.childInsertCalled = 0;
  state.inviteInsertCalled = 0;
  state.consentCalls = 0;
  state.rpcCalls = [];
  state.rpcResponse = { data: null, error: null };
  state.childUpdates = [];
  state.childCountForPair = 0;
  state.placementUpdates = [];
  state.activeForNannyCount = 0;
  state.activeForParentCount = 0;
  state.nannyRow = null;
  state.parentRow = null;
  state.activityLogs = [];
  delete process.env.INVITE_LINKS_ENABLED;
});

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/legal/record-consent", () => ({
  recordConsent: vi.fn(async () => {
    state.consentCalls += 1;
    return { success: true };
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.authUser },
        error: state.authUser ? null : { message: "no user" },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      switch (table) {
        case "user_roles":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data:
                    state.userRoles.find(
                      (r) => r.user_id === state.authUser?.id,
                    ) ?? null,
                  error: null,
                }),
              }),
            }),
          };
        case "child_client":
          return {
            insert: (_row: Record<string, unknown>) => {
              state.childInsertCalled += 1;
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "child-new" },
                    error: null,
                  }),
                }),
              };
            },
            select: (
              _cols?: string,
              opts?: { count?: string; head?: boolean },
            ) => {
              if (opts?.count === "exact") {
                // count-only chain used by endPlacementIfNoSharedChildren
                // and the per-side active-placement counts.
                let counter = state.childCountForPair;
                const chain: Record<string, unknown> = {
                  eq(field: string, _value: unknown) {
                    if (
                      field === "nanny_user_id" &&
                      state.activeForNannyCount > 0
                    ) {
                      counter = state.activeForNannyCount;
                    }
                    return chain;
                  },
                  then: (fn: (r: { count: number; error: null }) => unknown) =>
                    Promise.resolve(fn({ count: counter, error: null })),
                };
                return chain;
              }
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: state.childById,
                    error: null,
                  }),
                }),
              };
            },
            update: (patch: Record<string, unknown>) => ({
              eq: async (_col: string, id: string) => {
                state.childUpdates.push({
                  id,
                  nanny_user_id: patch.nanny_user_id as null,
                });
                return { error: null };
              },
            }),
          };
        case "child_client_events":
          return {
            insert: async () => ({ error: null }),
          };
        case "child_invites":
          return {
            insert: async (_row: Record<string, unknown>) => {
              state.inviteInsertCalled += 1;
              return { error: null };
            },
          };
        case "activity_logs":
          return {
            insert: async (row: Record<string, unknown>) => {
              state.activityLogs.push(row);
              return { error: null };
            },
          };
        case "nannies":
          return {
            select: (_cols: string, opts?: { count?: string }) => {
              if (opts?.count === "exact") {
                const chain: Record<string, unknown> = {
                  eq() {
                    return chain;
                  },
                  then: (fn: (r: { count: number; error: null }) => unknown) =>
                    Promise.resolve(
                      fn({ count: state.activeForNannyCount, error: null }),
                    ),
                };
                return chain;
              }
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: state.nannyRow,
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        case "parents":
          return {
            select: (_cols: string, opts?: { count?: string }) => {
              if (opts?.count === "exact") {
                const chain: Record<string, unknown> = {
                  eq() {
                    return chain;
                  },
                  then: (fn: (r: { count: number; error: null }) => unknown) =>
                    Promise.resolve(
                      fn({ count: state.activeForParentCount, error: null }),
                    ),
                };
                return chain;
              }
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: state.parentRow,
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        case "nanny_placements":
          return {
            select: (_cols: string, opts?: { count?: string }) => {
              if (opts?.count === "exact") {
                // Disambiguate by reading the eq field path: nanny_id vs parent_id.
                let resolvedCount = 0;
                const chain: Record<string, unknown> = {
                  eq(field: string) {
                    if (field === "nanny_id") {
                      resolvedCount = state.activeForNannyCount;
                    } else if (field === "parent_id") {
                      resolvedCount = state.activeForParentCount;
                    }
                    return chain;
                  },
                  then: (fn: (r: { count: number; error: null }) => unknown) =>
                    Promise.resolve(fn({ count: resolvedCount, error: null })),
                };
                return chain;
              }
              return { eq: () => ({}) };
            },
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                eq: () => ({
                  eq: async () => {
                    state.placementUpdates.push(patch);
                    return { error: null };
                  },
                }),
              }),
            }),
          };
        default:
          throw new Error(`unmocked table: ${table}`);
      }
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResponse;
    },
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("createChild", () => {
  it("rejects when guardian_permission_confirmed is false (AGR-14)", async () => {
    state.userRoles = [{ user_id: "user-nanny-1", role: "nanny" }];
    const { createChild } = await import("./child-clients");
    const result = await createChild({
      first_name: "Test",
      date_of_birth: "2024-01-01",
      gender: null,
      guardian_permission_confirmed: false,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/guardian permission/i);
    expect(state.childInsertCalled).toBe(0);
    expect(state.inviteInsertCalled).toBe(0);
    expect(state.consentCalls).toBe(0);
  });
});

describe("connectChildInvite", () => {
  it("happy path: returns childId from RPC and revalidates", async () => {
    state.rpcResponse = {
      data: [{ child_id: "child-claimed-1" }],
      error: null,
    };
    const { connectChildInvite } = await import("./child-invites");
    const token = "ABCD-2345";
    const result = await connectChildInvite(token);
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ childId: "child-claimed-1" });
    expect(state.rpcCalls).toEqual([
      {
        name: "connect_child_invite",
        args: { p_token: token, p_caller_user: "user-nanny-1" },
      },
    ]);
  });

  it("translates SQLSTATE P0005 to role_mismatch envelope", async () => {
    state.rpcResponse = {
      data: null,
      error: { code: "P0005", message: "role mismatch" },
    };
    const { connectChildInvite } = await import("./child-invites");
    const result = await connectChildInvite("ABCD-2345");
    expect(result.success).toBe(false);
    expect(result.error).toBe("role_mismatch");
    expect(result.data).toBeNull();
  });
});

describe("removeNannyFromChild — multi-children placement", () => {
  it("does NOT end the placement when the same (parent, nanny) pair shares another child", async () => {
    state.authUser = { id: "user-parent-1", email: "parent@example.com" };
    state.childById = {
      id: "child-1",
      parent_user_id: "user-parent-1",
      nanny_user_id: "user-nanny-1",
    };
    // Pair (parent, nanny) still has 1 other child after this removal.
    state.childCountForPair = 1;

    const { removeNannyFromChild } = await import("./child-clients");
    const result = await removeNannyFromChild("child-1");

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(state.childUpdates).toEqual([
      { id: "child-1", nanny_user_id: null },
    ]);
    // Critical assertion: NO placement_update must occur — the placement
    // stays active because another child still links the pair.
    expect(state.placementUpdates).toHaveLength(0);
    // Audit log records placement_ended=false so observability stays correct.
    expect(state.activityLogs).toEqual([
      expect.objectContaining({
        action_type: "nanny_removed_by_parent",
        action_details: expect.objectContaining({
          placement_ended: false,
        }),
      }),
    ]);
  });
});
