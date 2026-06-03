import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies BEFORE importing the SUT
vi.mock("@/lib/supabase/admin");
vi.mock("./helpers");
vi.mock("./resend");

import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmailInfo } from "./helpers";
import { sendEmail } from "./resend";
import {
  notifyParentOfFeedPost,
  FEED_POST_NOTIFICATION_EMAIL_TYPE,
} from "./feed-post-notification";

const PARENT_USER_ID = "parent-uuid-aaaa";
const NANNY_USER_ID = "nanny-uuid-bbbb";
const CHILD_ID = "child-uuid-cccc";

type ChildRow = {
  parent_user_id: string | null;
  first_name: string | null;
} | null;

/** Type-safe partial-mock factory for the deeply-nested Supabase client. */
function asAdminClient(
  from: ReturnType<typeof vi.fn>,
): ReturnType<typeof createAdminClient> {
  return { from } as unknown as ReturnType<typeof createAdminClient>;
}

function mockChildLookup(
  child: ChildRow,
  supabaseError: { message: string; code: string } | null = null,
): void {
  // Match the production Supabase error shape ({ message, code, ... } — plain
  // object, not a JS Error instance). Drives the `childErr || !child` branch.
  const error =
    supabaseError ??
    (child ? null : { message: "no row returned", code: "PGRST116" });
  const single = vi.fn().mockResolvedValue({ data: child, error });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  vi.mocked(createAdminClient).mockReturnValue(asAdminClient(from));
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: sendEmail resolves successfully so tests that don't override it
  // see the happy-path behaviour.
  vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "msg_1" });
});

describe("notifyParentOfFeedPost — exports", () => {
  it("exports the email type constant with the expected literal value", () => {
    expect(FEED_POST_NOTIFICATION_EMAIL_TYPE).toBe("feed_post_notification");
  });
});

describe("notifyParentOfFeedPost — skip rules (no DB lookup needed)", () => {
  it("Skip 3 (insight): logType='insight' short-circuits BEFORE the child lookup", async () => {
    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "insight",
      logContext: "adhoc",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(getUserEmailInfo).not.toHaveBeenCalled();
  });

  it("Skip 4 (non-adhoc context): logContext='activity' short-circuits BEFORE the child lookup", async () => {
    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "progress",
      logContext: "activity",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(getUserEmailInfo).not.toHaveBeenCalled();
  });

  it("Skip 4 (non-adhoc context): logContext='assessment' also short-circuits", async () => {
    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "assessment",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe("notifyParentOfFeedPost — skip rules (after DB lookup)", () => {
  it("Skip 1 (no parent): child_client.parent_user_id IS NULL → no email", async () => {
    mockChildLookup({ parent_user_id: null, first_name: "Olivia" });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(createAdminClient).toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("Skip 2 (self-post): authorId === parent_user_id → no email", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: PARENT_USER_ID, // <-- same as parent
      logType: "diary",
      logContext: "adhoc",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("notifyParentOfFeedPost — defensive skips", () => {
  it("skips when child_client row is missing entirely", async () => {
    mockChildLookup(null);

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when getUserEmailInfo(parent_user_id) returns null", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo).mockResolvedValue(null);

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when parent's resolved email is empty string", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo).mockResolvedValue({
      email: "",
      firstName: "Parent",
      lastName: "",
      userId: PARENT_USER_ID,
    });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("notifyParentOfFeedPost — happy path", () => {
  it("calls sendEmail with the expected payload when all skip rules pass", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockResolvedValueOnce({
        email: "nanny@example.com",
        firstName: "Sarah",
        lastName: "",
        userId: NANNY_USER_ID,
      });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        emailType: FEED_POST_NOTIFICATION_EMAIL_TYPE,
        recipientUserId: PARENT_USER_ID,
        subject: "Sarah posted to Olivia's feed",
      }),
    );

    // The call's html + text fields are populated from the template
    const call = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(call?.html).toContain("Sarah has just posted to Olivia");
    expect(call?.text).toContain("Sarah has just posted to Olivia's feed");
    expect(call?.text).toContain("/parent/development/");
  });

  it("falls back to nanny-NULL subject when author lookup returns null", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockResolvedValueOnce(null); // author lookup failed

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "New post on Olivia's feed",
      }),
    );
  });

  it("falls back to child-NULL subject when child first_name is null", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: null });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockResolvedValueOnce({
        email: "nanny@example.com",
        firstName: "Sarah",
        lastName: "",
        userId: NANNY_USER_ID,
      });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Sarah posted a new update",
      }),
    );
  });

  it("strips CR/LF/NUL/VT/FF/U+2028/U+2029 from names before subject build (header-injection defence)", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockResolvedValueOnce({
        // Includes CR, LF, NUL, VT, FF, U+2028 LINE SEP, U+2029 PARAGRAPH SEP
        email: "nanny@example.com",
        firstName: "Sarah\r\nBcc: attacker@evil.com\x00\u2028\u2029",
        lastName: "",
        userId: NANNY_USER_ID,
      });

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    const call = vi.mocked(sendEmail).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    // The security boundary: no control chars survive into the subject
    // string. Resend takes the subject as a single argument, so the only
    // header-injection vector is a CR/LF/etc. breaking the value across
    // SMTP headers. The "Bcc: attacker@\u2026" SUBSTRING between control chars
    // is left as visible text \u2014 that's ugly but not exploitable.
    expect(call?.subject).not.toMatch(/[\r\n\x00\x0B\x0C\u2028\u2029]/u);
    // Sarah still appears (the chars were replaced with spaces, then trimmed)
    expect(call?.subject).toContain("Sarah");
  });

  it("falls back to fully-neutral subject when both names are unresolved", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: null });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockResolvedValueOnce(null); // author lookup failed too

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "New post on your child's feed",
      }),
    );
  });
});

describe("notifyParentOfFeedPost — failure tolerance (non-fatal)", () => {
  it("does NOT throw when sendEmail rejects (Resend outage)", async () => {
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo).mockResolvedValue({
      email: "parent@example.com",
      firstName: "Parent",
      lastName: "",
      userId: PARENT_USER_ID,
    });
    vi.mocked(sendEmail).mockRejectedValue(new Error("Resend outage"));

    await expect(
      notifyParentOfFeedPost({
        childId: CHILD_ID,
        authorId: NANNY_USER_ID,
        logType: "observation",
        logContext: "adhoc",
      }),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when admin client throws synchronously", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    await expect(
      notifyParentOfFeedPost({
        childId: CHILD_ID,
        authorId: NANNY_USER_ID,
        logType: "observation",
        logContext: "adhoc",
      }),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when BOTH getUserEmailInfo calls reject (Promise.allSettled absorbs)", async () => {
    // Promise.allSettled means a rejected lookup becomes null at the
    // destructured site rather than propagating. With BOTH null, the
    // `!parentInfo` guard fires and sendEmail is never called.
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo).mockRejectedValue(
      new Error("profile lookup failed"),
    );

    await expect(
      notifyParentOfFeedPost({
        childId: CHILD_ID,
        authorId: NANNY_USER_ID,
        logType: "observation",
        logContext: "adhoc",
      }),
    ).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still sends email when ONLY the author lookup rejects (parent succeeds, nanny-NULL fallback)", async () => {
    // Author name is cosmetic; an author-lookup failure must NOT prevent
    // the parent from receiving the notification. Template falls back to
    // the nanny-NULL subject form.
    mockChildLookup({ parent_user_id: PARENT_USER_ID, first_name: "Olivia" });
    vi.mocked(getUserEmailInfo)
      .mockResolvedValueOnce({
        email: "parent@example.com",
        firstName: "Parent",
        lastName: "",
        userId: PARENT_USER_ID,
      })
      .mockRejectedValueOnce(new Error("author profile fetch failed"));

    await notifyParentOfFeedPost({
      childId: CHILD_ID,
      authorId: NANNY_USER_ID,
      logType: "observation",
      logContext: "adhoc",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "parent@example.com",
        subject: "New post on Olivia's feed",
      }),
    );
  });

  it("does NOT throw when the child lookup returns a Supabase error", async () => {
    mockChildLookup(null, { message: "PGRST116: 0 rows", code: "PGRST116" });

    await expect(
      notifyParentOfFeedPost({
        childId: CHILD_ID,
        authorId: NANNY_USER_ID,
        logType: "observation",
        logContext: "adhoc",
      }),
    ).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
