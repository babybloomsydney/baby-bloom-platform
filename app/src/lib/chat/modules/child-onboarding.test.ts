import { describe, it, expect } from "vitest";
import {
  childOnboardingModule,
  renderOnboardingStateBlock,
} from "./child-onboarding";
import type { ModuleContext } from "./types";
import type { BotSettings, OnboardingState } from "@/types/bapp";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal ModuleContext for tests where the handler shouldn't reach
 *  any of the context's fields. The supabase client is a stub — if a
 *  test inadvertently hits it the call will throw on the missing
 *  method, surfacing the leak loudly. */
function fakeCtx(): ModuleContext {
  return {
    botId: "test-bot",
    userId: "test-user",
    userRole: "nanny",
    effectiveRole: "nanny",
    children: [],
    currentSurface: null,
    supabase: {} as SupabaseClient,
  };
}

describe("child-onboarding module — skeleton (Unit 2)", () => {
  describe("module identity + shape", () => {
    it("uses the canonical id 'child-onboarding' (not 'onboarding')", () => {
      // The existing parent-position-coach module owns id 'onboarding'.
      // Collision would silently shadow one of them in the registry
      // because the byModuleId map keys on id. Asserting here so a
      // future refactor can't accidentally rename to the colliding id.
      expect(childOnboardingModule.id).toBe("child-onboarding");
    });

    it("declares a human-readable name + description", () => {
      expect(childOnboardingModule.name.length).toBeGreaterThan(0);
      // BloomBotModule.description is required (non-optional in the
      // interface) — read directly without a nullish guard so the
      // assertion fails loudly if the field is ever mistakenly removed.
      expect(childOnboardingModule.description.length).toBeGreaterThan(0);
    });

    it("is allowed for both nannies and parents", () => {
      expect(childOnboardingModule.rolesAllowed).toContain("nanny");
      expect(childOnboardingModule.rolesAllowed).toContain("parent");
    });

    it("starts with empty tools[] and empty proactiveTriggers[] (T2 skeleton — populated in T4-T6)", () => {
      expect(childOnboardingModule.tools).toEqual([]);
      expect(childOnboardingModule.proactiveTriggers ?? []).toEqual([]);
    });
  });

  // ── T3: prompt fragment + runtime state block ──────────────────────────
  describe("systemPromptFragment content", () => {
    // Pulled to the describe scope so each test reads from a single
    // narrowed reference instead of casting `as string` per assertion.
    const fragment = childOnboardingModule.systemPromptFragment;

    it("is a non-empty string", () => {
      expect(typeof fragment).toBe("string");
      expect(typeof fragment === "string" && fragment.length > 0).toBe(true);
    });

    it("instructs Katie never to mention 'bath time' (Bailey constraint)", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      // Locate the bath line + assert it carries a NEGATIVE directive.
      const bathLine = fragment.split("\n").find((l) => /bath time/i.test(l));
      expect(bathLine).toBeDefined();
      expect(bathLine).toMatch(/never|do not|don't/i);
    });

    it("includes the explicit directive that the topic id is internal-only (PRINCIPLES §8)", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      // The id `dev_snapshot` legitimately appears in two contexts:
      //   (a) markdown-bold topic headings (`**dev_snapshot** — ...`)
      //       where the id is being labelled, not spoken
      //   (b) tool-call arguments (`update_onboarding_state(topic='dev_snapshot', ...)`)
      // Both are fine — Katie reads them, doesn't echo them. The
      // constitutional requirement is that the fragment contain an
      // explicit directive telling Katie not to say the id to the
      // user. Assert the directive's presence rather than over-
      // policing the heading format.
      const directiveLine = fragment
        .split("\n")
        .find(
          (l) =>
            /dev_snapshot|topic id/i.test(l) &&
            /never|internal/i.test(l) &&
            /user/i.test(l),
        );
      expect(directiveLine).toBeDefined();
    });

    it("instructs that the snapshot/dev_snapshot label is internal-only", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      // Must contain a directive that "snapshot" is internal — exact
      // phrasing tolerated, but the assertion verifies the rule lands.
      expect(fragment.toLowerCase()).toMatch(/internal/);
      expect(fragment).toMatch(/milestones/i);
    });

    it("age-gates the bottle question to children under 24 months", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      expect(fragment).toMatch(/bottle/i);
      expect(fragment).toMatch(/24/);
    });

    it("references the runtime state block (the block lives in runtime, not this fragment)", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      // Static prompts cannot contain per-turn state; the renderer
      // injects the table at runtime. The fragment must point Katie
      // at it.
      expect(fragment).toMatch(/onboarding state/i);
      expect(fragment).toMatch(/runtime/i);
    });

    it("ties the wrap step to update_onboarding_state — the only thing that flips onboarding_completed", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      expect(fragment).toMatch(/wrap/i);
      expect(fragment).toMatch(/update_onboarding_state/);
    });

    it("explicitly distinguishes 'deferred' from 'skipped'", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      expect(fragment).toMatch(/deferred/i);
      expect(fragment).toMatch(/skipped/i);
      expect(fragment).toMatch(/deferred ≠ skipped|deferred is different/i);
    });

    it("forbids composing UUID-bearing URLs in plain text (PRINCIPLES §8)", () => {
      if (typeof fragment !== "string") throw new Error("fragment missing");
      // The wrap section must route through create_tile's `action`
      // slot rather than instructing Katie to type a URL with a
      // child id. This is a structural defense against the UUID-leak
      // hazard the comment-analyzer caught in the v0 fragment.
      expect(fragment).toMatch(/create_tile/i);
      expect(fragment).toMatch(/action/i);
      // The literal placeholder `{{child_id}}` must NOT appear in the
      // fragment — that template would be substituted into a plain-
      // text URL the user reads.
      expect(fragment).not.toContain("{{child_id}}");
    });
  });

  describe("renderOnboardingStateBlock", () => {
    function makeState(): OnboardingState {
      return {
        started_at: "2026-05-08T01:23:00Z",
        last_active_at: "2026-05-08T01:31:42Z",
        current_step: "dev_snapshot",
        topics: {
          welcome: { status: "captured", summary: "(greeted)" },
          schedule: { status: "captured", summary: "Mon-Fri 8-4" },
          routine: { status: "skipped" },
          dev_snapshot: { status: "pending" },
          first_post: { status: "pending" },
          activity: { status: "pending" },
          child_photo: { status: "pending" },
          wrap: { status: "pending" },
        },
      };
    }

    it("returns null when no settings provided", () => {
      expect(renderOnboardingStateBlock(undefined)).toBeNull();
    });

    it("returns null when settings have no onboarding_state (cascade not yet started)", () => {
      const settings: BotSettings = {};
      expect(renderOnboardingStateBlock(settings)).toBeNull();
    });

    it("returns null when onboarding_completed=true (defense-in-depth — even if predicate forgot to filter)", () => {
      // The enabledForBot predicate already excludes the module post-
      // completion, but the runtime renderer is also defensive: if a
      // future caller forgets to thread settings to the registry, the
      // block still drops out at the runtime layer.
      const settings: BotSettings = {
        onboarding_completed: true,
        onboarding_state: makeState(),
      };
      expect(renderOnboardingStateBlock(settings)).toBeNull();
    });

    it("renders a markdown block with all 8 topic ids when state is active", () => {
      const settings: BotSettings = { onboarding_state: makeState() };
      const block = renderOnboardingStateBlock(settings);
      expect(block).not.toBeNull();
      const expectedTopics = [
        "welcome",
        "schedule",
        "routine",
        "dev_snapshot",
        "first_post",
        "activity",
        "child_photo",
        "wrap",
      ];
      for (const topic of expectedTopics) {
        expect(block).toContain(topic);
      }
    });

    it("includes captured-topic summaries verbatim", () => {
      const settings: BotSettings = { onboarding_state: makeState() };
      const block = renderOnboardingStateBlock(settings)!;
      expect(block).toContain("Mon-Fri 8-4");
      expect(block).toContain("(greeted)");
    });

    it("renders an em-dash (not undefined / null) for non-captured topics", () => {
      const settings: BotSettings = { onboarding_state: makeState() };
      const block = renderOnboardingStateBlock(settings)!;
      // Pending / skipped rows must not leak the literal word
      // 'undefined' or 'null' — they show '—' in the summary cell.
      expect(block).not.toContain("undefined");
      expect(block).not.toContain("null");
      expect(block).toContain("—");
    });

    it("renders current_step + last_active_at as separate lines below the table", () => {
      const settings: BotSettings = { onboarding_state: makeState() };
      const block = renderOnboardingStateBlock(settings)!;
      expect(block).toContain("current_step: dev_snapshot");
      expect(block).toContain("last_active_at: 2026-05-08T01:31:42Z");
    });

    it("truncates a long captured-summary so the table stays aligned", () => {
      const longSummary =
        "Mon-Fri 8am-4pm, Saturday mornings sometimes, plus occasional evening sits";
      // BotSettings is typed; cast a plausible overflow value through
      // the type so we can construct it. The renderer doesn't care
      // about the type-system origin, only the runtime length.
      const state: OnboardingState = {
        ...makeState(),
        topics: {
          ...makeState().topics,
          schedule: { status: "captured", summary: longSummary },
        },
      };
      const block = renderOnboardingStateBlock({ onboarding_state: state })!;
      // Truncation marker '…' must appear once in the rendered cell;
      // the original 70+ char summary must NOT appear in full.
      expect(block).not.toContain(longSummary);
      expect(block).toContain("…");
    });

    it("silently skips a topic key that's missing from state.topics (defensive)", () => {
      const state = makeState();
      // Construct a topics map missing one key. TS forbids removing a
      // required Record member, so cast through unknown to model the
      // partial-write case at runtime (a malformed DB row, an old
      // migration, etc.).
      const partialTopics = { ...state.topics } as Record<string, unknown>;
      delete partialTopics.routine;
      const malformed = {
        ...state,
        topics: partialTopics,
      } as unknown as OnboardingState;
      const block = renderOnboardingStateBlock({
        onboarding_state: malformed,
      })!;
      // Other topics still render; the missing one simply doesn't
      // appear. The renderer doesn't throw, doesn't render `undefined`.
      expect(block).toContain("welcome");
      expect(block).toContain("schedule");
      expect(block).not.toContain("routine ");
      expect(block).not.toContain("undefined");
    });
  });

  describe("enabledForBot predicate", () => {
    it("is active when settings have no onboarding_completed flag (fresh bot)", () => {
      const settings: BotSettings = {};
      expect(childOnboardingModule.enabledForBot?.(settings)).toBe(true);
    });

    it("is active when onboarding_completed is explicitly false", () => {
      const settings: BotSettings = { onboarding_completed: false };
      expect(childOnboardingModule.enabledForBot?.(settings)).toBe(true);
    });

    it("is INACTIVE when onboarding_completed is exactly true (the only off switch)", () => {
      const settings: BotSettings = { onboarding_completed: true };
      expect(childOnboardingModule.enabledForBot?.(settings)).toBe(false);
    });

    it("stays active when onboarding_completed is undefined alongside other fields", () => {
      // A bot with waking_hours set but no onboarding_completed — older
      // bots created before A-08 ships will look like this. They must
      // still see the cascade if they create their first child.
      const settings: BotSettings = {
        waking_hours: {
          start: "07:00",
          end: "22:00",
          timezone: "Australia/Sydney",
        },
      };
      expect(childOnboardingModule.enabledForBot?.(settings)).toBe(true);
    });

    it("stays active when onboarding_completed has a truthy NON-boolean value (defensive against unexpected DB payloads)", () => {
      // The JSONB column is `unknown` outside typed fields. A row
      // could in principle contain `onboarding_completed: "done"` or
      // `1` from a hand-edited DB write or a future schema drift.
      // The predicate uses strict `!== true`, so any value other
      // than literal boolean `true` keeps the cascade active —
      // critical because the only thing that turns it off should be
      // a deliberate `update_onboarding_state(topic='wrap',
      // status='captured')` call, which writes the boolean.
      const stringy = {
        onboarding_completed: "done",
      } as unknown as BotSettings;
      const numeric = { onboarding_completed: 1 } as unknown as BotSettings;
      expect(childOnboardingModule.enabledForBot?.(stringy)).toBe(true);
      expect(childOnboardingModule.enabledForBot?.(numeric)).toBe(true);
    });
  });

  describe("execute handler (defensive — no tools yet)", () => {
    it("returns a clear error for any tool name (no tools registered until T4)", async () => {
      const result = await childOnboardingModule.execute(
        "update_onboarding_state",
        {},
        fakeCtx(),
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no tools registered yet/i);
    });
  });
});
