import { describe, it, expect, beforeEach, vi } from "vitest";
import { interpolate, __resetPromptCache } from "./context";

// Mock the supabase admin client. All DB calls flow through this mock.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// Shared test state — reset in beforeEach
let mockVersionHash = "hash-1";
let mockSections: Array<{
  section: string;
  content: string;
  version: number;
  protected: boolean;
}> = [];

const mockAdminClient = {
  from: (table: string) => {
    if (table === "katie_prompt_version") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { version_hash: mockVersionHash },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "katie_prompt") {
      return {
        select: () => ({
          eq: async () => ({
            data: mockSections,
            error: null,
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  },
};

describe("interpolate", () => {
  it("replaces {variable} with provided values", () => {
    expect(interpolate("Hello {name}!", { name: "Bailey" })).toBe(
      "Hello Bailey!",
    );
  });

  it("leaves unknown placeholders as-is", () => {
    expect(interpolate("Hi {x}", {})).toBe("Hi {x}");
  });

  it("handles multiple occurrences", () => {
    expect(interpolate("{a} and {a}", { a: "x" })).toBe("x and x");
  });
});

describe("loadActiveSections + cache invalidation", () => {
  beforeEach(() => {
    __resetPromptCache();
    mockVersionHash = "hash-1";
    mockSections = [
      {
        section: "identity",
        content: "I am Katie.",
        version: 1,
        protected: false,
      },
      {
        section: "voice",
        content: "Be concise.",
        version: 1,
        protected: false,
      },
    ];
  });

  it("loads from DB on first call", async () => {
    const { loadActiveSections } = await import("./context");
    const sections = await loadActiveSections();
    expect(sections.size).toBe(2);
    expect(sections.get("identity")?.content).toBe("I am Katie.");
  });

  it("uses cache on second call with same hash", async () => {
    const { loadActiveSections } = await import("./context");
    await loadActiveSections();

    // Change DB content but keep hash — should use cache
    mockSections = [
      {
        section: "identity",
        content: "CHANGED but cached should win",
        version: 2,
        protected: false,
      },
    ];

    const second = await loadActiveSections();
    expect(second.get("identity")?.content).toBe("I am Katie."); // still cached
  });

  it("reloads when hash changes (invalidation)", async () => {
    const { loadActiveSections } = await import("./context");
    await loadActiveSections();

    mockSections = [
      {
        section: "identity",
        content: "Updated content",
        version: 2,
        protected: false,
      },
    ];
    mockVersionHash = "hash-2";

    const second = await loadActiveSections();
    expect(second.get("identity")?.content).toBe("Updated content");
    expect(second.size).toBe(1); // voice is gone from new snapshot
  });

  it("filters by requested sectionIds", async () => {
    const { loadActiveSections } = await import("./context");
    const result = await loadActiveSections(["identity"]);
    expect(result.size).toBe(1);
    expect(result.has("identity")).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  beforeEach(() => {
    __resetPromptCache();
    mockVersionHash = "hash-build";
    mockSections = [
      {
        section: "identity",
        content: "You are Katie, {user_name}'s assistant.",
        version: 1,
        protected: false,
      },
      {
        section: "voice",
        content: "Be concise.",
        version: 1,
        protected: false,
      },
      {
        section: "role_nanny",
        content: "User is a nanny.",
        version: 1,
        protected: false,
      },
      {
        section: "role_parent",
        content: "User is a parent.",
        version: 1,
        protected: false,
      },
      {
        section: "module.diary",
        content: "Use log_food for meals.",
        version: 1,
        protected: false,
      },
      {
        section: "module.feed",
        content: "Use read_recent_feed.",
        version: 1,
        protected: false,
      },
    ];
  });

  it("assembles nanny prompt with role_nanny section", async () => {
    const { buildSystemPrompt } = await import("./context");
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "nanny",
      effectiveRole: "nanny",
      userName: "Bailey",
      children: [],
    });
    expect(prompt).toContain("You are Katie, Bailey's assistant.");
    expect(prompt).toContain("Be concise.");
    expect(prompt).toContain("User is a nanny.");
    expect(prompt).not.toContain("User is a parent.");
  });

  it("includes module.* fragments sorted alphabetically", async () => {
    const { buildSystemPrompt } = await import("./context");
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "nanny",
      effectiveRole: "nanny",
      userName: "Bailey",
      children: [],
    });
    const diaryPos = prompt.indexOf("log_food for meals");
    const feedPos = prompt.indexOf("read_recent_feed");
    expect(diaryPos).toBeGreaterThan(-1);
    expect(feedPos).toBeGreaterThan(-1);
    expect(diaryPos).toBeLessThan(feedPos); // "diary" < "feed"
  });

  it("renders runtime header with user + children + role", async () => {
    const { buildSystemPrompt } = await import("./context");
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "nanny",
      effectiveRole: "nanny",
      userName: "Bailey",
      children: [
        {
          id: "c1",
          firstName: "Oliver",
          ageMonths: 18,
          ageBracket: "12-24 months",
          gender: "male",
        },
      ],
    });
    expect(prompt).toContain("## Who You Are Speaking With");
    expect(prompt).toContain("Name: Bailey");
    expect(prompt).toContain("Role: nanny");
    expect(prompt).toContain("Oliver — 18mo");
  });

  it("includes currentSurface block when provided", async () => {
    const { buildSystemPrompt } = await import("./context");
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "nanny",
      effectiveRole: "nanny",
      userName: "Bailey",
      children: [],
      currentSurface: { route: "/nanny/jobs", feature: "job-search" },
    });
    expect(prompt).toContain("## Current Surface");
    expect(prompt).toContain("Route: /nanny/jobs");
    expect(prompt).toContain("Feature: job-search");
  });

  it("uses effective_role for role section selection", async () => {
    const { buildSystemPrompt } = await import("./context");
    // Admin user simulating parent
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "admin",
      effectiveRole: "parent",
      userName: "Admin",
      children: [],
    });
    expect(prompt).toContain("User is a parent.");
    expect(prompt).not.toContain("User is a nanny.");
  });

  it("falls back to hardcoded identity when DB has no identity row", async () => {
    mockSections = []; // empty
    __resetPromptCache();
    const { buildSystemPrompt } = await import("./context");
    const prompt = await buildSystemPrompt({
      botId: "b1",
      userId: "u1",
      role: "nanny",
      effectiveRole: "nanny",
      userName: "Bailey",
      children: [],
    });
    expect(prompt).toContain("You are Katie");
  });
});
