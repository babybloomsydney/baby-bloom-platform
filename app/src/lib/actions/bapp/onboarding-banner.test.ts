import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the admin + auth clients used by the server actions.
const state = vi.hoisted(() => ({
  authUser: { id: "user-1" } as { id: string } | null,
  botRow: null as {
    id: string;
    user_id: string;
    settings: Record<string, unknown>;
  } | null,
  botUpdates: [] as Array<Record<string, unknown>>,
}));

beforeEach(() => {
  state.authUser = { id: "user-1" };
  state.botRow = null;
  state.botUpdates = [];
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.authUser },
        error: state.authUser ? null : { message: "no user" },
      }),
    },
    from(table: string) {
      if (table !== "bloombot") {
        throw new Error(`unmocked table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.botRow,
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          // The dismiss path chains .eq("id", ...).eq("user_id", ...)
          // — return a thenable from the second .eq to match.
          eq: (_col1: string, _v1: string) => ({
            eq: async (_col2: string, _v2: string) => {
              state.botUpdates.push({ ...patch });
              if (state.botRow && patch.settings) {
                state.botRow.settings = patch.settings as Record<
                  string,
                  unknown
                >;
              }
              return { error: null };
            },
          }),
        }),
      };
    },
  }),
}));

describe("getOnboardingBannerStatus", () => {
  it("returns visible:false when no bot exists yet (fresh user)", async () => {
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(false);
  });

  it("returns visible:false when onboarding_completed=true", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: { onboarding_completed: true },
    };
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(false);
  });

  it("returns visible:false when onboarding_dismissed=true (user opted out)", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: { onboarding_dismissed: true },
    };
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(false);
  });

  it("returns visible:true with fresh-skip copy when no captured topics yet", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: {
        onboarding_completed: false,
        onboarding_dismissed: false,
        onboarding_state: {
          started_at: "2026-05-07T10:00:00Z",
          last_active_at: "2026-05-07T10:00:00Z",
          current_step: "routine",
          topics: {
            routine: { status: "pending" },
            schedule: { status: "pending" },
            dev_snapshot: { status: "pending" },
          },
        },
      },
    };
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(true);
    expect(result.hasCapturedTopics).toBe(false);
    expect(result.pendingCount).toBe(3);
    expect(result.pendingTopicLabels.length).toBeGreaterThan(0);
  });

  it("returns visible:true with continue copy when at least one topic captured", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: {
        onboarding_completed: false,
        onboarding_dismissed: false,
        onboarding_state: {
          started_at: "2026-05-07T10:00:00Z",
          last_active_at: "2026-05-07T10:30:00Z",
          current_step: "schedule",
          topics: {
            routine: { status: "captured", summary: "morning routine" },
            schedule: { status: "pending" },
            dev_snapshot: { status: "pending" },
          },
        },
      },
    };
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(true);
    expect(result.hasCapturedTopics).toBe(true);
    expect(result.pendingCount).toBe(2);
  });

  it("returns visible:false when state has no pending topics (all captured/skipped)", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: {
        onboarding_completed: false,
        onboarding_dismissed: false,
        onboarding_state: {
          started_at: "2026-05-07T10:00:00Z",
          last_active_at: "2026-05-07T11:00:00Z",
          current_step: "wrap",
          topics: {
            routine: { status: "captured", summary: "x" },
            schedule: { status: "skipped" },
            dev_snapshot: { status: "deferred" },
          },
        },
      },
    };
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    // Nothing left to nudge on — banner suppresses itself.
    expect(result.visible).toBe(false);
  });

  it("returns visible:false when not authenticated", async () => {
    state.authUser = null;
    const { getOnboardingBannerStatus } = await import("./onboarding-banner");
    const result = await getOnboardingBannerStatus();
    expect(result.visible).toBe(false);
  });
});

describe("dismissOnboardingBanner", () => {
  it("flips onboarding_dismissed=true via read-merge-write, preserving other settings", async () => {
    state.botRow = {
      id: "bot-1",
      user_id: "user-1",
      settings: {
        waking_hours: { start: "07:00", end: "22:00", timezone: "UTC" },
        onboarding_state: {
          started_at: "2026-05-07T10:00:00Z",
          last_active_at: "2026-05-07T10:30:00Z",
          current_step: "schedule",
          topics: { schedule: { status: "pending" } },
        },
      },
    };
    const { dismissOnboardingBanner } = await import("./onboarding-banner");
    const result = await dismissOnboardingBanner();
    expect(result.success).toBe(true);
    expect(state.botUpdates).toHaveLength(1);
    const merged = state.botUpdates[0].settings as Record<string, unknown>;
    expect(merged.onboarding_dismissed).toBe(true);
    // Other keys preserved unchanged.
    expect(merged.waking_hours).toBeDefined();
    expect(merged.onboarding_state).toBeDefined();
  });

  it("returns success:false when not authenticated", async () => {
    state.authUser = null;
    const { dismissOnboardingBanner } = await import("./onboarding-banner");
    const result = await dismissOnboardingBanner();
    expect(result.success).toBe(false);
    expect(result.error).toBe("not_authenticated");
    expect(state.botUpdates).toHaveLength(0);
  });

  it("returns success:false with bot_not_found when no bot exists yet", async () => {
    state.authUser = { id: "user-1" };
    state.botRow = null;
    const { dismissOnboardingBanner } = await import("./onboarding-banner");
    const result = await dismissOnboardingBanner();
    expect(result.success).toBe(false);
    expect(result.error).toBe("bot_not_found");
    expect(state.botUpdates).toHaveLength(0);
  });
});
