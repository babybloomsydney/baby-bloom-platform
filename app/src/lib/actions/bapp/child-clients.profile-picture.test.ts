/**
 * `updateChildProfilePictureUrl` — A-06.
 *
 * The full server action is exercised through Supabase mocks. The
 * security-critical surface here is the "must be parent OR nanny on
 * this child" authorisation gate, paired with the URL validator. This
 * is a NEW auth surface (parent's-own-avatar in A-05 had a single-
 * user-id binding; here either of two user ids can match).
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

const VALID_URL_PARENT = `https://test.supabase.co/storage/v1/object/public/profile-pictures/${PARENT_ID}/123-pic.jpg`;
const VALID_URL_NANNY = `https://test.supabase.co/storage/v1/object/public/profile-pictures/${NANNY_ID}/456-pic.jpg`;
const VALID_URL_STRANGER = `https://test.supabase.co/storage/v1/object/public/profile-pictures/${STRANGER_ID}/x.jpg`;

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
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

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

  // Build the chained mocks. Two distinct from() invocations:
  //   1. SELECT (auth lookup)  → .from('child_client').select(...).eq(...).maybeSingle()
  //   2. UPDATE                → .from('child_client').update(...).eq(...)
  eqSelectMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  selectMock.mockReturnValue({ eq: eqSelectMock });
  eqUpdateMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqUpdateMock });
  fromAdminMock.mockReturnValue({
    select: selectMock,
    update: updateMock,
  });
});

describe("updateChildProfilePictureUrl — authorisation", () => {
  it("succeeds for the linked parent", async () => {
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_PARENT,
    );
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      profile_picture_url: VALID_URL_PARENT,
    });
  });

  it("succeeds for the linked nanny", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: NANNY_ID } },
      error: null,
    });
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_NANNY,
    );
    expect(result.success).toBe(true);
  });

  it("rejects a stranger (neither parent nor nanny on this child)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: STRANGER_ID } },
      error: null,
    });
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_STRANGER,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not authorised");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_PARENT,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not authenticated");
  });

  it("rejects when the child does not exist", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_PARENT,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Child not found");
  });

  it("rejects a malformed (non-UUID) childClientId before reaching the DB", async () => {
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      "not-a-uuid",
      VALID_URL_PARENT,
    );
    expect(result.success).toBe(false);
    // Auth + URL validation pass first, but the malformed id is caught
    // before the admin SELECT fires — `maybeSingleMock` should be
    // untouched.
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("updateChildProfilePictureUrl — URL validation", () => {
  it("accepts null (Remove flow)", async () => {
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(CHILD_ID, null);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ profile_picture_url: null });
  });

  it("rejects a URL pointing at another user's folder", async () => {
    // Caller is the parent; URL is in the nanny's folder. Even though
    // the nanny is also linked to this child, the validator binds the
    // URL to the caller's OWN folder — the parent can only persist a
    // URL they uploaded themselves.
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      VALID_URL_NANNY,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an external URL", async () => {
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      "https://evil.example.com/track.gif",
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a path-traversal attempt", async () => {
    const { updateChildProfilePictureUrl } = await import("./child-clients");
    const result = await updateChildProfilePictureUrl(
      CHILD_ID,
      `https://test.supabase.co/storage/v1/object/public/profile-pictures/${PARENT_ID}/../verification-documents/x.jpg`,
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
