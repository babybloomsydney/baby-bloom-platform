import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── T-022 — createChild fromBonusProgram stamp tests ─────────────────
// Covers the gap flagged by the ECC code-reviewer (HIGH-4):
//   - stamp fires when fromBonusProgram=true
//   - stamp does NOT fire when fromBonusProgram is falsy
//   - mintChildInvite receives bonusProgram=true on the forwarded call
//   - activity_logs fallback row fires on stamp failure
//
// The full createChild server action has many dependencies; we mock
// only the surface needed to exercise the conditional + the UPDATE
// path. The pattern matches src/__tests__/auth/signUp.spec.ts.

interface UpdateCall {
  table: string;
  set: Record<string, unknown>;
  eqColumn: string;
  eqValue: unknown;
  isColumn: string;
  isValue: unknown;
}

interface InsertCall {
  table: string;
  payload: Record<string, unknown>;
}

const mocks = vi.hoisted(() => {
  const updateCalls: {
    table: string;
    set: Record<string, unknown>;
    eqColumn: string;
    eqValue: unknown;
    isColumn: string;
    isValue: unknown;
  }[] = [];
  const insertCalls: { table: string; payload: Record<string, unknown> }[] = [];

  // Configurable per-test. Stamp can be set to fail via `stampError`.
  const config = {
    stampError: null as { code?: string; message?: string } | null,
  };

  function makeAdminFrom() {
    return vi.fn((table: string) => ({
      // Chained read API used elsewhere in createChild (roleRow, nannyProfile)
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () =>
            table === "user_roles"
              ? { data: { role: "nanny" }, error: null }
              : table === "user_profiles"
                ? { data: { first_name: "Sarah" }, error: null }
                : { data: null, error: null },
          ),
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      // The first INSERT (child_client) needs to return a child id.
      // Subsequent INSERTs (child_client_events, activity_logs) return ok.
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertCalls.push({ table, payload });
        if (table === "child_client") {
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "child-uuid-789" },
                error: null,
              })),
            })),
          };
        }
        return Promise.resolve({ error: null });
      }),
      // The stamp UPDATE call. Capture the chained args.
      update: vi.fn((set: Record<string, unknown>) => ({
        eq: vi.fn((eqColumn: string, eqValue: unknown) => ({
          is: vi.fn(async (isColumn: string, isValue: unknown) => {
            updateCalls.push({
              table,
              set,
              eqColumn,
              eqValue,
              isColumn,
              isValue,
            });
            return { error: config.stampError };
          }),
        })),
      })),
    }));
  }

  return {
    config,
    updateCalls,
    insertCalls,
    adminFromMock: makeAdminFrom(),
    makeAdminFrom,
    // External dep mocks
    recordConsentMock: vi.fn(async () => undefined),
    mintChildInviteMock: vi.fn(async () => ({
      token: "AAAA-BBBB",
      url: "https://example.com/invite/AAAA-BBBB",
    })),
    recordCelebrationTileMock: vi.fn(async () => ({ ok: true })),
    dispatchChildCreatedMock: vi.fn(() => undefined),
    isUserSubsequentChildMock: vi.fn(async () => false),
  };
});

const updateCalls = mocks.updateCalls as UpdateCall[];
const insertCalls = mocks.insertCalls as InsertCall[];

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: { id: "user-uuid-456", email: "nanny@example.com" },
        },
        error: null,
      })),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.adminFromMock }),
}));

vi.mock("@/lib/legal/record-consent", () => ({
  recordConsent: mocks.recordConsentMock,
}));

vi.mock("@/lib/invite/mint", () => ({
  mintChildInvite: mocks.mintChildInviteMock,
}));

vi.mock("@/lib/invite/flags", () => ({
  invitesDisabled: () => false,
}));

vi.mock("./child-onboarding-dispatch", () => ({
  recordCelebrationTile: mocks.recordCelebrationTileMock,
  dispatchChildCreated: mocks.dispatchChildCreatedMock,
  isUserSubsequentChild: mocks.isUserSubsequentChildMock,
}));

vi.mock("@/lib/bapp/child-age", () => ({
  validateChildDob: () => ({ ok: true }),
  getChildAgeMonths: () => 12,
}));

vi.mock("@/lib/utils", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, capitalizeName: (s: string) => s };
});

describe("createChild fromBonusProgram stamp (T-022)", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    insertCalls.length = 0;
    mocks.config.stampError = null;
    // Rebuild the from() stub so spies are fresh per test
    mocks.adminFromMock = mocks.makeAdminFrom();
    mocks.recordConsentMock.mockClear();
    mocks.mintChildInviteMock.mockClear();
    mocks.recordCelebrationTileMock.mockClear();
    mocks.dispatchChildCreatedMock.mockClear();
    mocks.isUserSubsequentChildMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function callCreateChild(opts: { fromBonusProgram?: boolean }) {
    const { createChild } = await import("./child-clients");
    return createChild({
      first_name: "Liam",
      date_of_birth: "2024-01-15",
      gender: null,
      guardian_permission_confirmed: true,
      ...opts,
    });
  }

  it("fires the bonus_program_completed_at UPDATE when fromBonusProgram=true", async () => {
    const result = await callCreateChild({ fromBonusProgram: true });
    expect(result.success).toBe(true);
    const stampCalls = updateCalls.filter(
      (c) => c.table === "nannies" && "bonus_program_completed_at" in c.set,
    );
    expect(stampCalls).toHaveLength(1);
    const call = stampCalls[0];
    expect(call.eqColumn).toBe("user_id");
    expect(call.eqValue).toBe("user-uuid-456");
    expect(call.isColumn).toBe("bonus_program_completed_at");
    expect(call.isValue).toBeNull();
    // Timestamp should be ISO 8601 (e.g. 2026-05-18T05:19:00.000Z)
    expect(call.set.bonus_program_completed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("does NOT fire the stamp when fromBonusProgram=false", async () => {
    const result = await callCreateChild({ fromBonusProgram: false });
    expect(result.success).toBe(true);
    const stampCalls = updateCalls.filter(
      (c) => c.table === "nannies" && "bonus_program_completed_at" in c.set,
    );
    expect(stampCalls).toHaveLength(0);
  });

  it("does NOT fire the stamp when fromBonusProgram is omitted", async () => {
    const result = await callCreateChild({});
    expect(result.success).toBe(true);
    const stampCalls = updateCalls.filter(
      (c) => c.table === "nannies" && "bonus_program_completed_at" in c.set,
    );
    expect(stampCalls).toHaveLength(0);
  });

  it("forwards bonusProgram=true to mintChildInvite when fromBonusProgram=true", async () => {
    await callCreateChild({ fromBonusProgram: true });
    expect(mocks.mintChildInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({ bonusProgram: true }),
    );
  });

  it("forwards bonusProgram=false to mintChildInvite when fromBonusProgram is omitted", async () => {
    await callCreateChild({});
    expect(mocks.mintChildInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({ bonusProgram: false }),
    );
  });

  it("writes an activity_logs failure row when the stamp UPDATE returns an error", async () => {
    mocks.config.stampError = { code: "42P01", message: "relation not found" };
    const result = await callCreateChild({ fromBonusProgram: true });
    // Stamp failure is non-fatal — overall createChild still succeeds
    expect(result.success).toBe(true);
    const failureLogs = insertCalls.filter(
      (c) =>
        c.table === "activity_logs" &&
        (c.payload.action_details as Record<string, unknown>)
          ?.bonus_program_stamp_failed === true,
    );
    expect(failureLogs).toHaveLength(1);
    const log = failureLogs[0];
    expect(log.payload.user_id).toBe("user-uuid-456");
    expect(
      (log.payload.action_details as Record<string, unknown>).stamp_error_code,
    ).toBe("42P01");
  });
});
