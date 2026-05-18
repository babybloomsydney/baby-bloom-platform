/**
 * `updateChildDetails` — A-09 hero-card edit.
 *
 * Mirrors the auth-gate test shape established by
 * `child-clients.profile-picture.test.ts`. Focuses on:
 *   - validation (name length / shape, dob format / future-date)
 *   - the parent-OR-nanny ownership gate
 *   - the no-fields-to-update guard
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const updateMock = vi.fn();
const eqUpdateMock = vi.fn();
const selectMock = vi.fn();
const eqSelectMock = vi.fn();
const maybeSingleMock = vi.fn();
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

vi.mock("@/lib/invite/mint", () => ({ mintChildInvite: vi.fn() }));
vi.mock("@/lib/invite/flags", () => ({ invitesDisabled: () => false }));
vi.mock("@/lib/legal/record-consent", () => ({ recordConsent: vi.fn() }));

const PARENT_ID = "11111111-1111-4000-8000-111111111111";
const NANNY_ID = "22222222-2222-4000-8000-222222222222";
const STRANGER_ID = "33333333-3333-4000-8000-333333333333";
const CHILD_ID = "44444444-4444-4000-8000-444444444444";

beforeEach(() => {
  vi.resetModules();
  updateMock.mockReset();
  eqUpdateMock.mockReset();
  selectMock.mockReset();
  eqSelectMock.mockReset();
  maybeSingleMock.mockReset();
  fromAdminMock.mockReset();
  getUserMock.mockReset();
  revalidatePathMock.mockReset();

  // Default: caller is the linked parent.
  getUserMock.mockResolvedValue({
    data: { user: { id: PARENT_ID } },
    error: null,
  });

  // Default child row: linked to PARENT + NANNY.
  maybeSingleMock.mockResolvedValue({
    data: {
      id: CHILD_ID,
      parent_user_id: PARENT_ID,
      nanny_user_id: NANNY_ID,
    },
    error: null,
  });

  eqSelectMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  selectMock.mockReturnValue({ eq: eqSelectMock });
  eqUpdateMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqUpdateMock });
  fromAdminMock.mockReturnValue({
    select: selectMock,
    update: updateMock,
  });
});

describe("updateChildDetails — auth", () => {
  it("succeeds for the linked parent", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      first_name: "Olivia",
    });
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ first_name: "Olivia" });
  });

  it("succeeds for the linked nanny", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: NANNY_ID } },
      error: null,
    });
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      first_name: "Olivia",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stranger", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: STRANGER_ID } },
      error: null,
    });
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      first_name: "Olivia",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authorised/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      first_name: "Olivia",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateChildDetails — validation", () => {
  it("rejects an empty / whitespace-only first name", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const empty = await updateChildDetails(CHILD_ID, { first_name: "   " });
    expect(empty.success).toBe(false);
    expect(empty.error).toMatch(/invalid first name/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long first name", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const tooLong = "x".repeat(81);
    const result = await updateChildDetails(CHILD_ID, {
      first_name: tooLong,
    });
    expect(result.success).toBe(false);
  });

  it("trims the name before persisting", async () => {
    const { updateChildDetails } = await import("./child-clients");
    await updateChildDetails(CHILD_ID, { first_name: "  Sam  " });
    expect(updateMock).toHaveBeenCalledWith({ first_name: "Sam" });
  });

  it("rejects malformed dob", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      date_of_birth: "tomorrow",
    });
    expect(result.success).toBe(false);
    // Now delegates to shared `validateChildDob`, which returns typed
    // error codes (under_3 cap rolled in here too).
    expect(result.error).toBe("invalid_date_of_birth");
  });

  it("rejects future dob", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    const result = await updateChildDetails(CHILD_ID, {
      date_of_birth: iso,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("date_of_birth_in_future");
  });

  it("rejects dob older than the under-3 cap (closes the editor bypass)", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const tooOld = new Date();
    tooOld.setUTCFullYear(tooOld.getUTCFullYear() - 4);
    const iso = tooOld.toISOString().slice(0, 10);
    const result = await updateChildDetails(CHILD_ID, {
      date_of_birth: iso,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("child_too_old");
  });

  it("accepts a valid past dob", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      date_of_birth: "2024-01-15",
    });
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      date_of_birth: "2024-01-15",
    });
  });

  it("accepts dob = null to clear", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {
      date_of_birth: null,
    });
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ date_of_birth: null });
  });

  it("rejects an empty payload", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails(CHILD_ID, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no fields/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed child id", async () => {
    const { updateChildDetails } = await import("./child-clients");
    const result = await updateChildDetails("not-a-uuid", {
      first_name: "Sam",
    });
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
