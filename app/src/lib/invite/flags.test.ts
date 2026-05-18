import { beforeEach, describe, expect, it, vi } from "vitest";

// ── invite + bonus-program kill-switch flags ──────────────────────────
// Mirrors the pattern in src/lib/chat/flags.test.ts — `vi.stubEnv` per
// test, `vi.resetModules` between tests so each import re-evaluates the
// env at call time. Both flags follow the "explicit false disables"
// convention (any other value, including missing, leaves the feature ON).

describe("invite + bonus-program flags", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe("invitesDisabled()", () => {
    it("returns true when INVITE_LINKS_ENABLED is the literal string 'false'", async () => {
      vi.stubEnv("INVITE_LINKS_ENABLED", "false");
      const { invitesDisabled } = await import("./flags");
      expect(invitesDisabled()).toBe(true);
    });

    it("returns false when INVITE_LINKS_ENABLED is 'true'", async () => {
      vi.stubEnv("INVITE_LINKS_ENABLED", "true");
      const { invitesDisabled } = await import("./flags");
      expect(invitesDisabled()).toBe(false);
    });

    it("returns false when INVITE_LINKS_ENABLED is unset (default ON)", async () => {
      vi.stubEnv("INVITE_LINKS_ENABLED", "");
      const { invitesDisabled } = await import("./flags");
      expect(invitesDisabled()).toBe(false);
    });
  });

  describe("bonusProgramDisabled() — T-022", () => {
    it("returns true when BONUS_PROGRAM_ENABLED is the literal string 'false'", async () => {
      vi.stubEnv("BONUS_PROGRAM_ENABLED", "false");
      const { bonusProgramDisabled } = await import("./flags");
      expect(bonusProgramDisabled()).toBe(true);
    });

    it("returns false when BONUS_PROGRAM_ENABLED is 'true'", async () => {
      vi.stubEnv("BONUS_PROGRAM_ENABLED", "true");
      const { bonusProgramDisabled } = await import("./flags");
      expect(bonusProgramDisabled()).toBe(false);
    });

    it("returns false when BONUS_PROGRAM_ENABLED is unset (default ON)", async () => {
      vi.stubEnv("BONUS_PROGRAM_ENABLED", "");
      const { bonusProgramDisabled } = await import("./flags");
      expect(bonusProgramDisabled()).toBe(false);
    });

    it("returns false for any non-'false' value (e.g. '0', 'no', truthy spelling)", async () => {
      vi.stubEnv("BONUS_PROGRAM_ENABLED", "0");
      const { bonusProgramDisabled } = await import("./flags");
      expect(bonusProgramDisabled()).toBe(false);
    });
  });
});
