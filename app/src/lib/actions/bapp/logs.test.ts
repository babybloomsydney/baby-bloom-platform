/**
 * `softDeleteBAppLog` — A-09 tile delete.
 *
 * Verifies the auth gate (parent OR nanny on the child), idempotency
 * for already-deleted rows, and rejects the obvious bad inputs
 * (malformed id, unknown log).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const updateMock = vi.fn();
const eqUpdateMock = vi.fn();

const logSelectMock = vi.fn();
const logEqMock = vi.fn();
const logMaybeSingleMock = vi.fn();

const childSelectMock = vi.fn();
const childEqMock = vi.fn();
const childMaybeSingleMock = vi.fn();

const fromAdminMock = vi.fn();
const getUserMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => getUserMock() },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => fromAdminMock(table),
  }),
}));

const PARENT_ID = "11111111-1111-4000-8000-111111111111";
const NANNY_ID = "22222222-2222-4000-8000-222222222222";
const STRANGER_ID = "33333333-3333-4000-8000-333333333333";
const CHILD_ID = "44444444-4444-4000-8000-444444444444";
const LOG_ID = "55555555-5555-4000-8000-555555555555";

beforeEach(() => {
  vi.resetModules();
  updateMock.mockReset();
  eqUpdateMock.mockReset();
  logSelectMock.mockReset();
  logEqMock.mockReset();
  logMaybeSingleMock.mockReset();
  childSelectMock.mockReset();
  childEqMock.mockReset();
  childMaybeSingleMock.mockReset();
  fromAdminMock.mockReset();
  getUserMock.mockReset();
  revalidatePathMock.mockReset();

  // Default: caller is the linked parent.
  getUserMock.mockResolvedValue({
    data: { user: { id: PARENT_ID } },
    error: null,
  });

  // Default log row (active, links to CHILD_ID).
  logMaybeSingleMock.mockResolvedValue({
    data: {
      id: LOG_ID,
      child_client_id: CHILD_ID,
      is_active: true,
    },
    error: null,
  });

  // Default child row.
  childMaybeSingleMock.mockResolvedValue({
    data: {
      id: CHILD_ID,
      parent_user_id: PARENT_ID,
      nanny_user_id: NANNY_ID,
    },
    error: null,
  });

  // Build chained mocks per table. The action issues:
  //   1. from('bapp_logs').select('id, child_client_id, is_active').eq('id', ...).maybeSingle()
  //   2. from('child_client').select(...).eq('id', ...).maybeSingle()
  //   3. from('bapp_logs').update({ is_active: false }).eq('id', ...)
  logEqMock.mockReturnValue({ maybeSingle: logMaybeSingleMock });
  logSelectMock.mockReturnValue({ eq: logEqMock });

  childEqMock.mockReturnValue({ maybeSingle: childMaybeSingleMock });
  childSelectMock.mockReturnValue({ eq: childEqMock });

  eqUpdateMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqUpdateMock });

  fromAdminMock.mockImplementation((table: string) => {
    if (table === "bapp_logs") {
      return { select: logSelectMock, update: updateMock };
    }
    if (table === "child_client") {
      return { select: childSelectMock };
    }
    throw new Error(`Unexpected from() table: ${table}`);
  });
});

describe("softDeleteBAppLog", () => {
  it("succeeds for the linked parent", async () => {
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ is_active: false });
  });

  it("succeeds for the linked nanny", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: NANNY_ID } },
      error: null,
    });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(true);
  });

  it("rejects a stranger", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: STRANGER_ID } },
      error: null,
    });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorised/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  // Regression: an earlier order ran the idempotency short-circuit
  // before the ownership gate, leaking row existence to non-owners.
  // A stranger probing log ids must NOT learn that a soft-deleted
  // log exists by getting `success: true` back. (security-reviewer
  // 2026-05-07.)
  it("does NOT short-circuit to success for an already-inactive row when caller is a stranger", async () => {
    logMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: LOG_ID,
        child_client_id: CHILD_ID,
        is_active: false,
      },
      error: null,
    });
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: STRANGER_ID } },
      error: null,
    });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorised/i);
  });

  it("returns success without updating when row is already inactive (idempotent)", async () => {
    logMaybeSingleMock.mockResolvedValueOnce({
      data: {
        id: LOG_ID,
        child_client_id: CHILD_ID,
        is_active: false,
      },
      error: null,
    });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns Log not found for a malformed log id", async () => {
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog("not-a-uuid");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns Log not found when the log row does not exist", async () => {
    logMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { softDeleteBAppLog } = await import("./logs");
    const result = await softDeleteBAppLog(LOG_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});
