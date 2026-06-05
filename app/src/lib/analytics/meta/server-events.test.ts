/**
 * The signUp.Role.<Role> conversion call: fires CompleteRegistration tagged by
 * role, skips non-audience roles, and never throws (so it can't break signup).
 * `sendMetaEvent` is mocked here — its own fail-safe + network behaviour is
 * covered in capi.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./capi", () => ({
  sendMetaEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

const db = vi.hoisted(() => ({
  parentUserId: "user-9" as string | null,
  email: "parent@x.com" as string | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            table === "parents"
              ? {
                  data: db.parentUserId ? { user_id: db.parentUserId } : null,
                  error: null,
                }
              : { data: db.email ? { email: db.email } : null, error: null },
        }),
      }),
    }),
  }),
}));

import {
  fireSignupConversion,
  fireParentPositionConversion,
} from "./server-events";
import { sendMetaEvent } from "./capi";
import { META_EVENTS } from "./events";

beforeEach(() => {
  vi.clearAllMocks();
  db.parentUserId = "user-9";
  db.email = "parent@x.com";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fireSignupConversion — signUp.Role.<Role>", () => {
  it("fires CompleteRegistration tagged content_category=parent for a parent", async () => {
    await fireSignupConversion({
      role: "parent",
      userId: "u-1",
      email: "parent@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(sendMetaEvent).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(sendMetaEvent).mock.calls[0][0];
    expect(arg.eventName).toBe(META_EVENTS.completeRegistration);
    expect(arg.customData?.content_category).toBe("parent");
    expect(arg.userData.email).toBe("parent@example.com");
    expect(arg.userData.externalId).toBe("u-1");
    expect(typeof arg.eventId).toBe("string");
    expect(arg.eventId.length).toBeGreaterThan(0);
  });

  it("tags content_category=nanny for a nanny signup", async () => {
    await fireSignupConversion({
      role: "nanny",
      userId: "u-2",
      email: "n@example.com",
    });
    const arg = vi.mocked(sendMetaEvent).mock.calls[0][0];
    expect(arg.customData?.content_category).toBe("nanny");
  });

  it("does NOT fire for a non-audience role (admin)", async () => {
    await fireSignupConversion({
      role: "admin",
      userId: "u-3",
      email: "a@example.com",
    });
    expect(sendMetaEvent).not.toHaveBeenCalled();
  });

  it("never throws, even if the Meta send rejects", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMetaEvent).mockRejectedValueOnce(new Error("boom"));
    await expect(
      fireSignupConversion({ role: "parent", userId: "u-4", email: "p@x.com" }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("fireParentPositionConversion — SubmitApplication", () => {
  it("fires SubmitApplication tagged parent, with a per-position event_id + looked-up identity", async () => {
    await fireParentPositionConversion({
      parentId: "p-1",
      positionId: "pos-1",
      flow: "dashboard",
    });
    expect(sendMetaEvent).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(sendMetaEvent).mock.calls[0][0];
    expect(arg.eventName).toBe(META_EVENTS.submitApplication);
    expect(arg.customData?.content_category).toBe("parent");
    expect(arg.customData?.flow).toBe("dashboard");
    expect(arg.eventId).toContain("pos-1");
    expect(arg.userData.externalId).toBe("user-9");
    expect(arg.userData.email).toBe("parent@x.com");
  });

  it("still fires (degraded, no identity) when the parent can't be resolved", async () => {
    db.parentUserId = null;
    await fireParentPositionConversion({
      parentId: "p-missing",
      positionId: "pos-3",
    });
    expect(sendMetaEvent).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(sendMetaEvent).mock.calls[0][0];
    expect(arg.eventName).toBe(META_EVENTS.submitApplication);
    expect(arg.customData?.content_category).toBe("parent");
    expect(arg.userData.externalId).toBeUndefined();
    expect(arg.userData.email).toBeUndefined();
  });

  it("never throws if the Meta send fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMetaEvent).mockRejectedValueOnce(new Error("boom"));
    await expect(
      fireParentPositionConversion({ parentId: "p-2", positionId: "pos-2" }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
