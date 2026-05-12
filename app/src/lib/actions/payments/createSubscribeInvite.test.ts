/**
 * createSubscribeInvite — unit tests.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S5.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  authUser: { id: "nanny-uuid" } as { id: string } | null,
  child: null as null | {
    id: string;
    first_name: string | null;
    nanny_user_id: string | null;
    parent_user_id: string | null;
  },
  existingInviteToken: null as string | null,
  insertedRows: [] as Record<string, unknown>[],
  profiles: new Map<string, string | null>(),
}));

beforeEach(() => {
  state.authUser = { id: "nanny-uuid" };
  state.child = {
    id: "child-lily",
    first_name: "Lily",
    nanny_user_id: "nanny-uuid",
    parent_user_id: "parent-uuid-sarah",
  };
  state.existingInviteToken = null;
  state.insertedRows = [];
  state.profiles.clear();
  state.profiles.set("nanny-uuid", "Jane");
  state.profiles.set("parent-uuid-sarah", "Sarah");
  vi.clearAllMocks();
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.authUser },
        error: state.authUser ? null : new Error("unauth"),
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  /* eslint-disable @typescript-eslint/no-explicit-any */
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "child_client") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.child,
                error: state.child ? null : new Error("not found"),
              }),
            }),
          }),
        };
      }
      if (table === "subscribe_invites") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: state.existingInviteToken
                      ? { token: state.existingInviteToken }
                      : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            state.insertedRows.push(row);
            return { data: null, error: null };
          },
        };
      }
      if (table === "user_profiles") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: { first_name: state.profiles.get(val) ?? null },
                error: null,
              }),
            }),
          }),
        };
      }
      return { from: () => ({}) } as any;
    },
  }),
  /* eslint-enable @typescript-eslint/no-explicit-any */
}));

import { createSubscribeInvite } from "./createSubscribeInvite";
import { isValidSubscribeInviteToken } from "@/lib/payments/subscribe-invite-token";

describe("createSubscribeInvite", () => {
  it("returns Not authenticated when unauth'd", async () => {
    state.authUser = null;
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/not authenticated/i);
  });

  it("rejects when caller is not the nanny on the child", async () => {
    state.child!.nanny_user_id = "different-nanny";
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/authorised/i);
  });

  it("rejects when child has no connected parent", async () => {
    state.child!.parent_user_id = null;
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/no connected parent/i);
  });

  it("mints a new token + inserts subscribe_invites row when no pending invite exists", async () => {
    state.existingInviteToken = null;
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.token).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(r.data.url).toContain("/subscribe-for/");
      expect(r.data.url).toContain(r.data.token);
    }
    expect(state.insertedRows).toHaveLength(1);
    expect(state.insertedRows[0]).toMatchObject({
      child_client_id: "child-lily",
      nanny_user_id: "nanny-uuid",
      parent_user_id: "parent-uuid-sarah",
      status: "pending",
    });
  });

  it("reuses existing pending token (idempotent re-share)", async () => {
    state.existingInviteToken = "ABCD-EFGH";
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.token).toBe("ABCD-EFGH");
      expect(r.data.url).toContain("ABCD-EFGH");
    }
    // No new insert.
    expect(state.insertedRows).toHaveLength(0);
  });

  it("shareText interpolates parent + nanny + child first names", async () => {
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shareText).toMatch(/Hi Sarah/);
      expect(r.data.shareText).toMatch(/Jane/);
      expect(r.data.shareText).toMatch(/Lily/);
      expect(r.data.shareText).toContain(r.data.url);
    }
  });

  it("shareText falls back gracefully when profile names missing", async () => {
    state.profiles.clear();
    state.child!.first_name = null;
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(true);
    if (r.success) {
      // No "undefined" or template hole.
      expect(r.data.shareText).not.toMatch(/undefined/);
      expect(r.data.shareText).not.toMatch(/\{/);
    }
  });

  it("does not use banned 'tracking' terminology", async () => {
    const r = await createSubscribeInvite("child-lily");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.shareText.toLowerCase()).not.toMatch(
        /\btrack(ing|ed|s)?\b/,
      );
    }
  });
});

describe("isValidSubscribeInviteToken", () => {
  it("accepts well-formed tokens", () => {
    expect(isValidSubscribeInviteToken("ABCD-EFGH")).toBe(true);
    expect(isValidSubscribeInviteToken("9999-2222")).toBe(true);
  });

  it("rejects malformed", () => {
    expect(isValidSubscribeInviteToken("")).toBe(false);
    expect(isValidSubscribeInviteToken("ABCDEFGH")).toBe(false);
    expect(isValidSubscribeInviteToken("ABC-DEFGH")).toBe(false);
    expect(isValidSubscribeInviteToken("abcd-efgh")).toBe(false);
    expect(isValidSubscribeInviteToken("AAA0-BBBB")).toBe(false); // 0 banned
    expect(isValidSubscribeInviteToken("AAAI-BBBB")).toBe(false); // I banned
    expect(isValidSubscribeInviteToken(null)).toBe(false);
    expect(isValidSubscribeInviteToken(undefined)).toBe(false);
    expect(isValidSubscribeInviteToken(123)).toBe(false);
  });
});
