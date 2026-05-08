import { describe, it, expect } from "vitest";
import { childOnboardingModule } from "./child-onboarding";
import type { ModuleContext } from "./types";
import type { BotSettings } from "@/types/bapp";
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
