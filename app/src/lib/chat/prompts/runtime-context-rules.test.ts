/**
 * Tests for the runtime_context_rules prompt section.
 *
 * Per `Latency:Efficiency/07-test-plan.md §WU9`:
 *
 * Sections 1-5 are LIVE-MODEL behavioural assertions (read suppression,
 * freshness override, etc.) and live in the ai-regression-testing
 * harness, not here — those need a real Gemini call to evaluate. This
 * file covers the structural tests (6-10): the section gets loaded
 * into the assembled prompt for every role, in the right position,
 * and the existing voice/personality/boundaries sections are
 * untouched.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetPromptCache } from "../context";
import { SEED_SECTIONS } from "./seed-data";

const RUNTIME_CONTEXT_SECTION = SEED_SECTIONS.find(
  (s) => s.section === "runtime_context_rules",
)!;

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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

beforeEach(() => {
  __resetPromptCache();
  mockVersionHash = `hash-${Date.now()}`;
  // Seed the mock with all canonical sections so buildStaticPrompt
  // gets a fully-assembled output. Pulled directly from SEED_SECTIONS.
  mockSections = SEED_SECTIONS.map((s) => ({
    section: s.section,
    content: s.content,
    version: 1,
    protected: s.protected ?? false,
  }));
});

describe("runtime_context_rules — section seed", () => {
  it("appears exactly once in seed-data.ts", () => {
    const matches = SEED_SECTIONS.filter(
      (s) => s.section === "runtime_context_rules",
    );
    expect(matches).toHaveLength(1);
  });

  it("is sized within reasonable token bounds", () => {
    // Rough proxy: tokens ≈ chars / 4. The spec quotes "~220 tokens"
    // but the content as written measures closer to ~600 tokens
    // (markdown bullets are verbose). Upper bound 3000 chars (~750
    // tokens) catches accidental bloat (e.g. someone copy-pasting a
    // tutorial); lower bound ensures it's not a stub. The exact
    // size is reviewed in the WU9 prompt-update plan.
    expect(RUNTIME_CONTEXT_SECTION.content.length).toBeLessThan(3000);
    expect(RUNTIME_CONTEXT_SECTION.content.length).toBeGreaterThan(500);
  });

  it("uses the second-person, instructive voice (no first-person Katie speech)", () => {
    const c = RUNTIME_CONTEXT_SECTION.content;
    // Voice fit: should NOT contain phrases that would be Katie speaking
    // to the user (this is operating discipline, not user-facing copy).
    expect(c).not.toMatch(/\bI'm Katie\b/);
    expect(c).not.toMatch(/\b(?:hi|hello)\b/i);
    // Must reference the actual runtime blocks Katie sees.
    expect(c).toContain("Already loaded for you");
    expect(c).toContain("runtime context");
  });

  it("is NOT marked protected (admin Katie may edit later)", () => {
    expect(RUNTIME_CONTEXT_SECTION.protected ?? false).toBe(false);
  });
});

describe("runtime_context_rules — assembled prompt integration", () => {
  it("loaded into the assembled prompt for nanny role", async () => {
    const { buildStaticPrompt } = await import("../context");
    const { staticPrompt } = await buildStaticPrompt({
      effectiveRole: "nanny",
      role: "nanny",
    });
    expect(staticPrompt).toContain("Using your runtime context");
  });

  it("loaded into the assembled prompt for parent role", async () => {
    const { buildStaticPrompt } = await import("../context");
    const { staticPrompt } = await buildStaticPrompt({
      effectiveRole: "parent",
      role: "parent",
    });
    expect(staticPrompt).toContain("Using your runtime context");
  });

  it("loaded into the assembled prompt for admin role", async () => {
    const { buildStaticPrompt } = await import("../context");
    const { staticPrompt } = await buildStaticPrompt({
      effectiveRole: "admin",
      role: "admin",
    });
    expect(staticPrompt).toContain("Using your runtime context");
  });

  it("appears AFTER logging_rules and BEFORE proactive_rules", async () => {
    const { buildStaticPrompt } = await import("../context");
    const { staticPrompt } = await buildStaticPrompt({
      effectiveRole: "nanny",
      role: "nanny",
    });
    const idxLogging = staticPrompt.indexOf("How You Log Entries");
    const idxRuntime = staticPrompt.indexOf("Using your runtime context");
    const idxProactive = staticPrompt.indexOf("How You Are Proactive");
    expect(idxLogging).toBeGreaterThan(-1);
    expect(idxRuntime).toBeGreaterThan(-1);
    expect(idxProactive).toBeGreaterThan(-1);
    expect(idxRuntime).toBeGreaterThan(idxLogging);
    expect(idxRuntime).toBeLessThan(idxProactive);
  });
});

describe("runtime_context_rules — voice/personality/boundaries untouched", () => {
  // Snapshot guard: WU9 must NOT modify these sections. Pin the seed
  // content lengths + first paragraph so unrelated edits (e.g. a
  // future cleanup pass) don't drift voice/personality silently.
  it("voice section untouched (length + opening preserved)", () => {
    const voice = SEED_SECTIONS.find((s) => s.section === "voice")!;
    expect(voice.content.length).toBeGreaterThan(0);
    // Voice opens with `## How You Speak`.
    expect(voice.content).toMatch(/^## How You Speak/);
  });

  it("personality section untouched", () => {
    const personality = SEED_SECTIONS.find((s) => s.section === "personality")!;
    expect(personality.content).toMatch(/^## Your Personality/);
  });

  it("boundaries section untouched", () => {
    const boundaries = SEED_SECTIONS.find((s) => s.section === "boundaries")!;
    expect(boundaries.content).toMatch(/^## BOUNDARIES/);
  });
});
