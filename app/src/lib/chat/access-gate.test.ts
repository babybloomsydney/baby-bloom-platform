/**
 * gateChildScopedTool — unit tests.
 *
 * The gate intercepts childScoped Katie tools before their handlers
 * run, returning a `subscription_required` ToolResult when the
 * resolved child's family lacks active access.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S6.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  /** What requireChildFamilyAccess should return for a given childId. */
  accessByChildId: new Map<string, { hasAccess: boolean; reason: string }>(),
  /** Calls captured for assertions. */
  accessCalls: [] as string[],
}));

beforeEach(() => {
  state.accessByChildId.clear();
  state.accessCalls = [];
  vi.clearAllMocks();
});

vi.mock("@/lib/payments/access-gate", () => ({
  requireChildFamilyAccess: vi.fn(async (childId: string) => {
    state.accessCalls.push(childId);
    return (
      state.accessByChildId.get(childId) ?? {
        hasAccess: true,
        reason: "ok",
      }
    );
  }),
}));

import { gateChildScopedTool } from "./access-gate";
import type { ChildSummary } from "./modules/types";

const children: ChildSummary[] = [
  {
    id: "child-lily",
    firstName: "Lily",
    ageMonths: 24,
    ageBracket: "24-36",
    underThree: true,
    underThreeOnboarded: false,
    gender: "female",
  } as unknown as ChildSummary,
  {
    id: "child-max",
    firstName: "Max",
    ageMonths: 36,
    ageBracket: "36-48",
    underThree: false,
    underThreeOnboarded: false,
    gender: "male",
  } as unknown as ChildSummary,
];

function makeSupabaseMock(
  parentUserIdByChildId: Record<string, string | null>,
  firstNameByParentUserId: Record<string, string | null>,
) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === "child_client") {
              return {
                data: { parent_user_id: parentUserIdByChildId[val] ?? null },
                error: null,
              };
            }
            if (table === "user_profiles") {
              return {
                data: { first_name: firstNameByParentUserId[val] ?? null },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  } as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe("gateChildScopedTool", () => {
  it("returns 'no_child_arg' when args.child_name is absent", async () => {
    const supabase = makeSupabaseMock({}, {});
    const out = await gateChildScopedTool({}, children, supabase);
    expect(out.kind).toBe("no_child_arg");
    expect(state.accessCalls).toEqual([]);
  });

  it("returns 'no_child_arg' when args.child_name is empty string", async () => {
    const supabase = makeSupabaseMock({}, {});
    const out = await gateChildScopedTool(
      { child_name: "" },
      children,
      supabase,
    );
    expect(out.kind).toBe("no_child_arg");
  });

  it("returns 'unresolvable' when child_name doesn't match any child", async () => {
    const supabase = makeSupabaseMock({}, {});
    const out = await gateChildScopedTool(
      { child_name: "Nobody" },
      children,
      supabase,
    );
    expect(out.kind).toBe("unresolvable");
    if (out.kind === "unresolvable") {
      expect(out.result.success).toBe(false);
    }
    expect(state.accessCalls).toEqual([]);
  });

  it("returns 'ok' when family has access (default mock)", async () => {
    const supabase = makeSupabaseMock({}, {});
    const out = await gateChildScopedTool(
      { child_name: "Lily" },
      children,
      supabase,
    );
    expect(out.kind).toBe("ok");
    expect(state.accessCalls).toEqual(["child-lily"]);
  });

  it("returns 'blocked' with parent + child names when family lapsed", async () => {
    state.accessByChildId.set("child-lily", {
      hasAccess: false,
      reason: "subscription_lapsed",
    });
    const supabase = makeSupabaseMock(
      { "child-lily": "parent-uuid-sarah" },
      { "parent-uuid-sarah": "Sarah" },
    );
    const out = await gateChildScopedTool(
      { child_name: "Lily" },
      children,
      supabase,
    );
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") {
      expect(out.childFirstName).toBe("Lily");
      expect(out.parentFirstName).toBe("Sarah");
      expect(out.result.error).toBe("subscription_required");
      expect(out.result.terminal).toBe(true);
      expect(out.result.data).toEqual({
        child_name: "Lily",
        parent_first_name: "Sarah",
      });
    }
  });

  it("blocks with null parent name when parent record is missing", async () => {
    state.accessByChildId.set("child-max", {
      hasAccess: false,
      reason: "subscription_cancelled_window_ended",
    });
    const supabase = makeSupabaseMock({}, {}); // no parent linkage
    const out = await gateChildScopedTool(
      { child_name: "Max" },
      children,
      supabase,
    );
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") {
      expect(out.parentFirstName).toBeNull();
    }
  });

  it("blocks per-child — Family A lapsed, Family B active", async () => {
    state.accessByChildId.set("child-lily", {
      hasAccess: false,
      reason: "subscription_lapsed",
    });
    // child-max keeps default ok.
    const supabase = makeSupabaseMock(
      { "child-lily": "parent-uuid-sarah" },
      { "parent-uuid-sarah": "Sarah" },
    );

    const blocked = await gateChildScopedTool(
      { child_name: "Lily" },
      children,
      supabase,
    );
    const ok = await gateChildScopedTool(
      { child_name: "Max" },
      children,
      supabase,
    );

    expect(blocked.kind).toBe("blocked");
    expect(ok.kind).toBe("ok");
  });
});
