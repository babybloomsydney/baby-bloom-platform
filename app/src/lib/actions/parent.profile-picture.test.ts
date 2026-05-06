/**
 * Test the URL-validation guard inside `updateParentProfilePictureUrl`.
 *
 * The full server action calls into Supabase, so we don't unit-test the
 * round-trip — we test the pure validator that decides whether a candidate
 * URL is acceptable for the `profile_picture_url` column. This is the
 * security-critical surface (per amendment A-05): without it, a caller
 * could persist any external URL, leaking referrer / hosting hostile
 * imagery / phishing-mimicking the parent's own account.
 *
 * The validator isn't exported (it's internal to the server action), so we
 * exercise its behaviour through the action's input contract by mocking
 * Supabase + asserting the action's success/error envelope.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const getUserMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => fromMock(table),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

vi.mock("./connection-helpers", () => ({ createInboxMessage: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockReset();
  revalidatePathMock.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

  // Authed user by default.
  getUserMock.mockResolvedValue({
    data: { user: { id: CALLER_ID } },
    error: null,
  });

  // Chained .from(...).update(...).eq(...) returning success.
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
});

// The caller's user id (mocked in beforeEach below) plus a UUID-shaped
// segment so the validator's per-user-folder gate accepts the URL.
const CALLER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_URL = `https://test.supabase.co/storage/v1/object/public/profile-pictures/${CALLER_ID}/123-pic.jpg`;

describe("updateParentProfilePictureUrl — URL validation", () => {
  it("accepts a public profile-pictures bucket URL", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(VALID_URL);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      profile_picture_url: VALID_URL,
    });
    expect(eqMock).toHaveBeenCalledWith("user_id", CALLER_ID);
  });

  it("accepts null (Remove Image flow)", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(null);
    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ profile_picture_url: null });
  });

  it("rejects a URL on a different bucket", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(
      "https://test.supabase.co/storage/v1/object/public/verification-documents/user-1/x.jpg",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an external URL pointing at an attacker domain", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(
      "https://evil.example.com/track.gif",
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a javascript: URL", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(
      "javascript:alert(1)" as string,
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an empty string", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl("");
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a URL pointing at another user's folder", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const otherUserId = "ffffffff-ffff-4000-8000-ffffffffffff";
    const result = await updateParentProfilePictureUrl(
      `https://test.supabase.co/storage/v1/object/public/profile-pictures/${otherUserId}/leaked.jpg`,
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a path-traversal attempt that resolves outside the bucket", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    // The raw string starts with the expected prefix; a naive prefix
    // check would accept it. `new URL()` collapses the `..` so the
    // pathname is normalised to `/storage/v1/object/public/verification-documents/...`.
    const result = await updateParentProfilePictureUrl(
      `https://test.supabase.co/storage/v1/object/public/profile-pictures/${CALLER_ID}/../verification-documents/leak.jpg`,
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a URL longer than 2048 chars", async () => {
    const { updateParentProfilePictureUrl } = await import("./parent");
    const longSuffix = "a".repeat(3000);
    const result = await updateParentProfilePictureUrl(
      `https://test.supabase.co/storage/v1/object/public/profile-pictures/${CALLER_ID}/${longSuffix}.jpg`,
    );
    expect(result.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns auth error when caller is not signed in", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const { updateParentProfilePictureUrl } = await import("./parent");
    const result = await updateParentProfilePictureUrl(VALID_URL);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not authenticated");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
