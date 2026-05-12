/**
 * cancelSubscription server action — unit tests (S9).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  authUser: { id: "parent-uuid" } as { id: string } | null,
  paymentsEnabled: true,
  subRow: null as null | {
    id: string;
    status: string;
    stripe_subscription_id: string | null;
    paid_period_ends_at: string | null;
  },
  stripeUpdateCalls: [] as Array<{ subId: string; args: unknown }>,
  stripeUpdateThrows: false,
  dbUpdateCalls: [] as Array<{
    table: string;
    payload: Record<string, unknown>;
  }>,
  dbUpdateError: null as null | { message: string },
  activityLogInserts: [] as Record<string, unknown>[],
}));

beforeEach(() => {
  state.authUser = { id: "parent-uuid" };
  state.paymentsEnabled = true;
  state.subRow = {
    id: "sub-row-1",
    status: "active_monthly",
    stripe_subscription_id: "sub_stripe_1",
    paid_period_ends_at: "2026-06-15T00:00:00+10:00",
  };
  state.stripeUpdateCalls = [];
  state.stripeUpdateThrows = false;
  state.dbUpdateCalls = [];
  state.dbUpdateError = null;
  state.activityLogInserts = [];
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

vi.mock("@/lib/payments/flags", () => ({
  PAYMENTS_ENABLED: true,
  get isPaymentsEnabled() {
    return state.paymentsEnabled;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  /* eslint-disable @typescript-eslint/no-explicit-any */
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "parent_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.subRow,
                error: state.subRow ? null : new Error("not found"),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              state.dbUpdateCalls.push({ table, payload });
              return { data: null, error: state.dbUpdateError };
            },
          }),
        };
      }
      if (table === "activity_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.activityLogInserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      return { from: () => ({}) } as any;
    },
  }),
  /* eslint-enable @typescript-eslint/no-explicit-any */
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeClient: () => ({
    subscriptions: {
      update: async (subId: string, args: unknown) => {
        if (state.stripeUpdateThrows) throw new Error("stripe failure");
        state.stripeUpdateCalls.push({ subId, args });
        return { id: subId };
      },
    },
  }),
}));

import { cancelSubscription } from "./cancelSubscription";

describe("cancelSubscription", () => {
  it("rejects when unauth'd", async () => {
    state.authUser = null;
    const r = await cancelSubscription({ reason: "other" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("not_authenticated");
  });

  it("rejects invalid reasons", async () => {
    const r = await cancelSubscription({
      // @ts-expect-error — testing runtime guard
      reason: "made_up_reason",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("invalid_reason");
  });

  it("returns no_subscription when row missing", async () => {
    state.subRow = null;
    const r = await cancelSubscription({ reason: "other" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("no_subscription");
  });

  it("monthly active: calls Stripe with cancel_at_period_end + flips DB to cancelled", async () => {
    const r = await cancelSubscription({
      reason: "too_expensive",
      reasonText: "rent went up",
    });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.paidPeriodEndsAt).toBe("2026-06-15T00:00:00+10:00");
    expect(state.stripeUpdateCalls).toHaveLength(1);
    expect(state.stripeUpdateCalls[0]?.subId).toBe("sub_stripe_1");
    expect(state.stripeUpdateCalls[0]?.args).toMatchObject({
      cancel_at_period_end: true,
      metadata: { cancellation_reason: "too_expensive" },
    });
    expect(state.dbUpdateCalls[0]?.payload).toMatchObject({
      status: "cancelled",
      cancellation_reason: "too_expensive",
      cancellation_reason_text: "rent went up",
    });
    expect(state.activityLogInserts).toHaveLength(1);
    expect(state.activityLogInserts[0]).toMatchObject({
      action_type: "subscription_cancelled",
    });
  });

  it("upfront active: skips Stripe, still flips DB + captures reason", async () => {
    state.subRow!.status = "active_upfront";
    state.subRow!.stripe_subscription_id = null;
    const r = await cancelSubscription({ reason: "circumstances_changed" });
    expect(r.success).toBe(true);
    expect(state.stripeUpdateCalls).toHaveLength(0);
    expect(state.dbUpdateCalls[0]?.payload).toMatchObject({
      status: "cancelled",
      cancellation_reason: "circumstances_changed",
    });
  });

  it("monthly with missing stripe_subscription_id returns error", async () => {
    state.subRow!.stripe_subscription_id = null;
    const r = await cancelSubscription({ reason: "other" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("no_stripe_sub_id");
  });

  it("already cancelled / lapsed: returns success no-op + captures reason for product learning", async () => {
    state.subRow!.status = "cancelled";
    const r = await cancelSubscription({ reason: "not_using" });
    expect(r.success).toBe(true);
    expect(state.stripeUpdateCalls).toHaveLength(0);
    // Reason still saved
    expect(state.dbUpdateCalls[0]?.payload).toMatchObject({
      cancellation_reason: "not_using",
    });
    // No status flip
    expect(state.dbUpdateCalls[0]?.payload).not.toHaveProperty("status");
  });

  it("Stripe update failure → stripe_update_failed", async () => {
    state.stripeUpdateThrows = true;
    const r = await cancelSubscription({ reason: "service_issue" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("stripe_update_failed");
  });

  it("reasonText is trimmed + capped at 500 chars", async () => {
    const long = "a".repeat(600);
    await cancelSubscription({ reason: "other", reasonText: long });
    const saved = state.dbUpdateCalls[0]?.payload.cancellation_reason_text;
    expect(typeof saved).toBe("string");
    expect((saved as string).length).toBe(500);
  });

  it("empty reasonText stored as null", async () => {
    await cancelSubscription({ reason: "other", reasonText: "   " });
    expect(state.dbUpdateCalls[0]?.payload.cancellation_reason_text).toBeNull();
  });

  it("active-branch DB UPDATE failure → db_update_failed (was unchecked before C6)", async () => {
    state.dbUpdateError = { message: "rls_denied" };
    const r = await cancelSubscription({ reason: "other" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("db_update_failed");
  });

  it("no-op-branch (cancelled): DB UPDATE failure now surfaces failure — silent before C6", async () => {
    state.subRow!.status = "cancelled";
    state.dbUpdateError = { message: "rls_denied" };
    const r = await cancelSubscription({ reason: "other" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toBe("db_update_failed");
  });

  it("no-op-branch (lapsed): DB UPDATE success still returns success + captures reason", async () => {
    state.subRow!.status = "lapsed";
    const r = await cancelSubscription({ reason: "not_using" });
    expect(r.success).toBe(true);
    expect(state.dbUpdateCalls[0]?.payload).toMatchObject({
      cancellation_reason: "not_using",
    });
    // Status NOT touched in no-op branch
    expect(state.dbUpdateCalls[0]?.payload).not.toHaveProperty("status");
  });
});
