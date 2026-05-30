/**
 * Tests for the T-041 POSITION_REQUIRED gate inside `createConnectionRequest`.
 *
 * The gate sits between the position lookup (active/filled) and the 5-cap
 * check; if no row matches `status in ('active','filled')`, the action
 * returns `{ success: false, error: "POSITION_REQUIRED" }` without writing
 * a `connection_requests` row. Linked-children shell positions evaluate
 * the gate true (they're `status='filled'`).
 *
 * We mock Supabase's chained query builder + `getParentId`, since the
 * fixture of a real DB isn't necessary to exercise the gate's branches.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

type FakePosition = { id: string; stage: number } | null;

const state = vi.hoisted(() => ({
  position: null as FakePosition,
  parentId: "parent-1" as string | null,
  insertCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("./parent", () => ({
  getParentId: vi.fn(async () => state.parentId),
}));

vi.mock("./connection-helpers", () => ({
  getNannyPhone: vi.fn(async () => null),
  getPositionSummary: vi.fn(async () => null),
  createInboxMessage: vi.fn(),
  logConnectionEvent: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/helpers", () => ({
  getUserEmailInfo: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

// Chained query builder fake — `from(table).select(...).eq(...).in(...).maybeSingle()`
// for position lookup; `from(table).select(..., { count: 'exact', head: true })...`
// for the 5-cap check; `from(table).select(...).eq(...).eq(...).in(...).not(...).single()`
// for the duplicate check; `from(table).insert(...).select(...).single()` for the write.

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    const positionMaybeSingle = vi.fn(async () => ({ data: state.position }));
    const positionIn = vi.fn(() => ({ maybeSingle: positionMaybeSingle }));
    const positionEq = vi.fn(() => ({ in: positionIn }));
    const positionSelect = vi.fn(() => ({ eq: positionEq }));

    const countEq = vi.fn(() => ({
      eq: vi.fn(async () => ({ count: 0 })),
    }));
    const countSelect = vi.fn(() => ({ eq: countEq }));

    const duplicateSingle = vi.fn(async () => ({ data: null }));
    const duplicateNot = vi.fn(() => ({ single: duplicateSingle }));
    const duplicateIn = vi.fn(() => ({ not: duplicateNot }));
    const duplicateEq2 = vi.fn(() => ({ in: duplicateIn }));
    const duplicateEq1 = vi.fn(() => ({ eq: duplicateEq2 }));
    const duplicateSelect = vi.fn(() => ({ eq: duplicateEq1 }));

    const insertSingle = vi.fn(async () => ({
      data: { id: "req-1" },
      error: null,
    }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn((row: Record<string, unknown>) => {
      state.insertCalls.push(row);
      return { select: insertSelect };
    });

    return {
      from: (table: string) => {
        if (table === "nanny_positions") return { select: positionSelect };
        if (table === "connection_requests") {
          return {
            select: vi.fn((_columns: string, opts?: { count?: string }) => {
              if (opts?.count === "exact") return countSelect();
              return duplicateSelect();
            }),
            insert,
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
  },
}));

beforeEach(() => {
  state.position = null;
  state.parentId = "parent-1";
  state.insertCalls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createConnectionRequest — POSITION_REQUIRED gate", () => {
  it("returns POSITION_REQUIRED when the parent has no active/filled position", async () => {
    state.position = null;

    const { createConnectionRequest } = await import("./connection");
    const result = await createConnectionRequest("nanny-1", "hello");

    expect(result).toEqual({ success: false, error: "POSITION_REQUIRED" });
    expect(state.insertCalls).toEqual([]);
  });

  it("proceeds past the gate when the parent has an active position", async () => {
    state.position = { id: "pos-1", stage: 1 };

    const { createConnectionRequest } = await import("./connection");
    // The downstream pipeline (notification emails, position-stage update)
    // calls into adminClient which isn't fully mocked — but the gate's
    // contract is just "let this through", verified by the connection_requests
    // INSERT having fired with the correct position_id.
    await createConnectionRequest("nanny-1", "hello").catch(() => undefined);

    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0]).toMatchObject({
      parent_id: "parent-1",
      nanny_id: "nanny-1",
      position_id: "pos-1",
    });
  });

  it("proceeds past the gate when the parent has a filled position (linked-children shell)", async () => {
    state.position = { id: "pos-shell", stage: 9 };

    const { createConnectionRequest } = await import("./connection");
    await createConnectionRequest("nanny-1").catch(() => undefined);

    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0]?.position_id).toBe("pos-shell");
  });

  it("still surfaces 'Not authenticated as parent' when getParentId is null (the auth gate fires before POSITION_REQUIRED)", async () => {
    state.parentId = null;

    const { createConnectionRequest } = await import("./connection");
    const result = await createConnectionRequest("nanny-1");

    expect(result.error).toBe("Not authenticated as parent");
    expect(state.insertCalls).toEqual([]);
  });
});
