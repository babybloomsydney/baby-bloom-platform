import { beforeEach, describe, expect, it, vi } from "vitest";

// ── T-022 — mintChildInvite tests ────────────────────────────────────
// Verifies the bonusProgram param lands on the INSERT payload (defaulting
// to false when absent). The token-generation + URL-building bits are
// indirectly verified by the existing invite-flow integration tests.

interface CapturedInsert {
  payload: Record<string, unknown>;
}

const mocks = vi.hoisted(() => {
  const captured: CapturedInsert[] = [];
  const insertMock = vi.fn(async (payload: Record<string, unknown>) => {
    captured.push({ payload });
    return { error: null };
  });
  return {
    captured,
    insertMock,
    adminFromMock: vi.fn((_table: string) => ({ insert: insertMock })),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.adminFromMock }),
}));

describe("mintChildInvite — bonusProgram param (T-022)", () => {
  beforeEach(() => {
    mocks.captured.length = 0;
    mocks.insertMock.mockClear();
    mocks.adminFromMock.mockClear();
  });

  async function mint(params: {
    bonusProgram?: boolean;
  }): Promise<{ token: string; url: string }> {
    const { mintChildInvite } = await import("./mint");
    return mintChildInvite({
      childId: "child-uuid-123",
      direction: "nanny_to_parent",
      userId: "user-uuid-456",
      userEmail: "nanny@example.com",
      ...params,
    });
  }

  it("defaults bonus_program to false when param is undefined", async () => {
    await mint({});
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0].payload.bonus_program).toBe(false);
  });

  it("persists bonus_program=true when bonusProgram=true is passed", async () => {
    await mint({ bonusProgram: true });
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0].payload.bonus_program).toBe(true);
  });

  it("persists bonus_program=false when bonusProgram=false is passed", async () => {
    await mint({ bonusProgram: false });
    expect(mocks.captured).toHaveLength(1);
    expect(mocks.captured[0].payload.bonus_program).toBe(false);
  });

  it("returns a token + URL on success regardless of bonusProgram value", async () => {
    const result = await mint({ bonusProgram: true });
    expect(typeof result.token).toBe("string");
    expect(result.token).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(result.url).toMatch(/\/invite\/[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("includes the standard insert fields alongside bonus_program", async () => {
    await mint({ bonusProgram: true });
    const payload = mocks.captured[0].payload;
    expect(payload).toMatchObject({
      child_client_id: "child-uuid-123",
      created_by_user_id: "user-uuid-456",
      created_by_email_at_creation: "nanny@example.com",
      direction: "nanny_to_parent",
      status: "pending",
      bonus_program: true,
    });
    expect(typeof payload.token).toBe("string");
  });
});
