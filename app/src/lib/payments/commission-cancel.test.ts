/**
 * cancelInFlightCommission — unit tests (T-018).
 *
 * Per spec: system/APP/PAYMENTS/PAYOUTS/07-test-plan.md Layer 4.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  updateCalls: [] as Array<{
    payload: Record<string, unknown>;
    sub: string;
    statuses: string[];
  }>,
  returnRows: [] as Array<{ id: string }>,
  returnError: null as null | { message: string },
}));

beforeEach(() => {
  state.updateCalls = [];
  state.returnRows = [{ id: "row-1" }];
  state.returnError = null;
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, sub: string) => ({
          in: (_col2: string, statuses: string[]) => ({
            select: async () => {
              state.updateCalls.push({ payload, sub, statuses });
              return { data: state.returnRows, error: state.returnError };
            },
          }),
        }),
      }),
    }),
  }),
}));

import { cancelInFlightCommission } from "./commission-cancel";

describe("cancelInFlightCommission", () => {
  it("T4.1: cancels pending row with reason='parent_cancelled'", async () => {
    state.returnRows = [{ id: "row-1" }];
    const result = await cancelInFlightCommission("sub-1", "parent_cancelled");
    expect(result).toEqual({ cancelled: 1 });
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0]?.payload).toMatchObject({
      status: "cancelled",
      failure_reason: "parent_cancelled",
    });
    expect(state.updateCalls[0]?.sub).toBe("sub-1");
    expect(state.updateCalls[0]?.statuses).toEqual(["pending", "held"]);
  });

  it("T4.2: cancels held row", async () => {
    state.returnRows = [{ id: "row-held" }];
    const result = await cancelInFlightCommission("sub-1", "parent_refunded");
    expect(result.cancelled).toBe(1);
    expect(state.updateCalls[0]?.payload).toMatchObject({
      status: "cancelled",
      failure_reason: "parent_refunded",
    });
  });

  it("T4.3-4.4: 0 rows matched → returns cancelled=0, no error", async () => {
    state.returnRows = [];
    const result = await cancelInFlightCommission(
      "sub-empty",
      "parent_cancelled",
    );
    expect(result.cancelled).toBe(0);
  });

  it("T4.5: DB error → throws", async () => {
    state.returnError = { message: "rls_denied" };
    await expect(
      cancelInFlightCommission("sub-1", "parent_cancelled"),
    ).rejects.toThrow(/cancelInFlight failed/);
  });

  it("T4.6: multiple rows cancelled in one call", async () => {
    state.returnRows = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
    const result = await cancelInFlightCommission("sub-1", "parent_cancelled");
    expect(result.cancelled).toBe(3);
  });

  it("status filter is exactly ['pending', 'held']", async () => {
    await cancelInFlightCommission("sub-1", "parent_cancelled");
    expect(state.updateCalls[0]?.statuses).toEqual(["pending", "held"]);
  });
});
