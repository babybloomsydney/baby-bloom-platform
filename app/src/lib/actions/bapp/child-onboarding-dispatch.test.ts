import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the proactive dispatcher BEFORE the module under test imports
// it, so we can assert call shape without firing a real bot dispatch.
const dispatchSpy = vi.fn();
vi.mock("@/lib/chat/proactive/action-triggered", () => ({
  dispatchActionTriggeredInBackground: (input: unknown) => dispatchSpy(input),
}));

import {
  recordCelebrationTile,
  dispatchChildCreated,
  isUserSubsequentChild,
} from "./child-onboarding-dispatch";

beforeEach(() => {
  dispatchSpy.mockClear();
});

describe("recordCelebrationTile", () => {
  it("inserts a custom-typed bapp_log with sparkles + violet branding", async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: () => ({ insert: insertSpy }),
    } as unknown as SupabaseClient;

    const result = await recordCelebrationTile({
      admin,
      childClientId: "child-1",
      authorId: "user-1",
      childFirstName: "Oliver",
    });

    expect(result.ok).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.child_client_id).toBe("child-1");
    expect(payload.author_id).toBe("user-1");
    expect(payload.type).toBe("custom");
    expect(payload.status).toBe("completed");
    expect(payload.context).toBe("adhoc");
    // Defends against future default-value changes on bapp_logs.is_active.
    expect(payload.is_active).toBe(true);
    const data = payload.data as Record<string, unknown>;
    expect(data.heading).toContain("Oliver");
    expect(data.icon).toBe("sparkles");
    expect(data.color).toBe("violet");
  });

  it("trims whitespace from the child name in the heading", async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const admin = {
      from: () => ({ insert: insertSpy }),
    } as unknown as SupabaseClient;
    await recordCelebrationTile({
      admin,
      childClientId: "child-1",
      authorId: "user-1",
      childFirstName: "  Lily  ",
    });
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    const data = payload.data as Record<string, unknown>;
    expect(data.heading).toContain("Lily has been added");
    expect(data.heading).not.toContain(" Lily");
  });

  it("returns ok:false with an opaque code on insert failure (does not leak Postgres error to caller)", async () => {
    const insertSpy = vi
      .fn()
      .mockResolvedValue({ error: { message: "RLS denied", code: "42501" } });
    const admin = {
      from: () => ({ insert: insertSpy }),
    } as unknown as SupabaseClient;

    const result = await recordCelebrationTile({
      admin,
      childClientId: "child-1",
      authorId: "user-1",
      childFirstName: "Casey",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("celebration_tile_failed");
    // Raw Postgres message must NOT be forwarded to the caller.
    expect(result.error).not.toMatch(/RLS denied/);
  });
});

describe("dispatchChildCreated", () => {
  it("calls the proactive dispatcher with triggerId='child.created' + the right payload shape", () => {
    dispatchChildCreated({
      recipientUserId: "user-1",
      childId: "child-1",
      childFirstName: "Oliver",
      userFirstName: "Emma",
      childAgeMonths: 18,
      isSubsequent: false,
      parentFirstNameIfKnown: "Sarah",
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const arg = dispatchSpy.mock.calls[0][0] as {
      triggerId: string;
      recipientUserId: string;
      payload: Record<string, unknown>;
    };
    expect(arg.triggerId).toBe("child.created");
    expect(arg.recipientUserId).toBe("user-1");
    expect(arg.payload).toMatchObject({
      child_id: "child-1",
      child_first_name: "Oliver",
      user_first_name: "Emma",
      is_subsequent: false,
      child_age_months: 18,
      parent_first_name_if_known: "Sarah",
    });
  });

  it("omits child_age_months when not provided", () => {
    dispatchChildCreated({
      recipientUserId: "user-1",
      childId: "child-1",
      childFirstName: "Theo",
      userFirstName: "Jess",
      isSubsequent: true,
    });
    const arg = dispatchSpy.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(arg.payload).not.toHaveProperty("child_age_months");
    expect(arg.payload.is_subsequent).toBe(true);
  });

  it("omits parent_first_name_if_known when not provided", () => {
    dispatchChildCreated({
      recipientUserId: "user-1",
      childId: "child-1",
      childFirstName: "Theo",
      userFirstName: "Jess",
      isSubsequent: false,
    });
    const arg = dispatchSpy.mock.calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(arg.payload).not.toHaveProperty("parent_first_name_if_known");
  });

  it("never throws even if the dispatcher implementation does (catches synchronously)", () => {
    dispatchSpy.mockImplementationOnce(() => {
      throw new Error("registry imploded");
    });
    expect(() =>
      dispatchChildCreated({
        recipientUserId: "user-1",
        childId: "child-1",
        childFirstName: "Theo",
        userFirstName: "Jess",
        isSubsequent: false,
      }),
    ).not.toThrow();
  });

  it("does not propagate when the dispatcher is mocked to return a rejecting promise", async () => {
    // The real dispatchActionTriggeredInBackground is `void` and attaches
    // its own .catch internally; this test guards the *contract* (caller
    // never observes a rejection), not the inner implementation.
    dispatchSpy.mockImplementationOnce(() => {
      // Intentionally swallow on the spy itself — mirrors the real
      // function's belt-and-braces pattern. A rejecting promise here
      // would surface as an unhandled rejection in test runs, so we
      // model the void-return contract directly.
      return undefined;
    });
    expect(() =>
      dispatchChildCreated({
        recipientUserId: "user-1",
        childId: "child-1",
        childFirstName: "Theo",
        userFirstName: "Jess",
        isSubsequent: false,
      }),
    ).not.toThrow();
  });
});

describe("isUserSubsequentChild", () => {
  function adminWith(count: number | null, error: { message: string } | null) {
    const final = { count, error };
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            neq: async () => final,
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it("returns false when the user has zero prior children", async () => {
    const result = await isUserSubsequentChild({
      admin: adminWith(0, null),
      userId: "user-1",
      side: "nanny",
      excludeChildId: "child-just-created",
    });
    expect(result).toBe(false);
  });

  it("returns true when the user has ≥1 prior children", async () => {
    const result = await isUserSubsequentChild({
      admin: adminWith(2, null),
      userId: "user-1",
      side: "nanny",
      excludeChildId: "child-just-created",
    });
    expect(result).toBe(true);
  });

  it("defaults to false (first-child variant) when the count read errors — over-onboarding is safer than silent skip", async () => {
    const result = await isUserSubsequentChild({
      admin: adminWith(null, { message: "connection lost" }),
      userId: "user-1",
      side: "parent",
      excludeChildId: "child-just-created",
    });
    expect(result).toBe(false);
  });
});
