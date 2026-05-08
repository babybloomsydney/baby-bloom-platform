import { describe, it, expect, beforeEach, vi } from "vitest";

describe("katie flags", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to disabled when env not set", async () => {
    vi.stubEnv("KATIE_ENABLED", "");
    vi.stubEnv("PROACTIVE_ENABLED", "");
    vi.stubEnv("KATIE_DAILY_LIMIT_USD", "");
    const mod = await import("./flags");
    expect(mod.KATIE_ENABLED).toBe(false);
    expect(mod.PROACTIVE_ENABLED).toBe(false);
    expect(mod.KATIE_DAILY_LIMIT_USD).toBe(0.65);
  });

  it('enables KATIE_ENABLED when set to "true"', async () => {
    vi.stubEnv("KATIE_ENABLED", "true");
    const mod = await import("./flags");
    expect(mod.KATIE_ENABLED).toBe(true);
  });

  it("PROACTIVE_ENABLED is gated by KATIE_ENABLED", async () => {
    vi.stubEnv("KATIE_ENABLED", "false");
    vi.stubEnv("PROACTIVE_ENABLED", "true");
    const mod = await import("./flags");
    expect(mod.PROACTIVE_ENABLED).toBe(false);
  });

  it("PROACTIVE_ENABLED true only when both are true", async () => {
    vi.stubEnv("KATIE_ENABLED", "true");
    vi.stubEnv("PROACTIVE_ENABLED", "true");
    const mod = await import("./flags");
    expect(mod.PROACTIVE_ENABLED).toBe(true);
  });

  it("parses KATIE_DAILY_LIMIT_USD as number", async () => {
    vi.stubEnv("KATIE_DAILY_LIMIT_USD", "1.25");
    const mod = await import("./flags");
    expect(mod.KATIE_DAILY_LIMIT_USD).toBe(1.25);
  });

  it("falls back to default on invalid limit", async () => {
    vi.stubEnv("KATIE_DAILY_LIMIT_USD", "not-a-number");
    const mod = await import("./flags");
    expect(mod.KATIE_DAILY_LIMIT_USD).toBe(0.65);
  });

  // ── Latency build flags (Latency:Efficiency build, 2026-05-09) ────────

  describe("KATIE_PARALLEL_TOOLS_ENABLED", () => {
    it("defaults to true when env unset", async () => {
      vi.stubEnv("KATIE_PARALLEL_TOOLS_ENABLED", "");
      const mod = await import("./flags");
      expect(mod.KATIE_PARALLEL_TOOLS_ENABLED).toBe(true);
    });

    it('can be disabled via env="false"', async () => {
      vi.stubEnv("KATIE_PARALLEL_TOOLS_ENABLED", "false");
      const mod = await import("./flags");
      expect(mod.KATIE_PARALLEL_TOOLS_ENABLED).toBe(false);
    });
  });

  describe("KATIE_PRELOAD_PASSTHROUGH_ENABLED", () => {
    it("defaults to true when env unset", async () => {
      vi.stubEnv("KATIE_PRELOAD_PASSTHROUGH_ENABLED", "");
      vi.stubEnv("NEXT_PUBLIC_KATIE_PRELOAD_PASSTHROUGH_ENABLED", "");
      const mod = await import("./flags");
      expect(mod.KATIE_PRELOAD_PASSTHROUGH_ENABLED).toBe(true);
    });

    it("can be disabled via the server env var", async () => {
      vi.stubEnv("KATIE_PRELOAD_PASSTHROUGH_ENABLED", "false");
      const mod = await import("./flags");
      expect(mod.KATIE_PRELOAD_PASSTHROUGH_ENABLED).toBe(false);
    });

    it("falls back to NEXT_PUBLIC_* when server var is unset", async () => {
      // Use vi.unstubAllEnvs first so KATIE_PRELOAD_PASSTHROUGH_ENABLED is
      // genuinely undefined (not empty-string from a prior stub). The `??`
      // operator only falls through on undefined, not empty string —
      // matches real env-var behaviour where the var is either set or
      // not.
      vi.unstubAllEnvs();
      vi.stubEnv("NEXT_PUBLIC_KATIE_PRELOAD_PASSTHROUGH_ENABLED", "false");
      const mod = await import("./flags");
      expect(mod.KATIE_PRELOAD_PASSTHROUGH_ENABLED).toBe(false);
    });
  });

  describe("KATIE_ALWAYS_ON_CONTEXT_ENABLED", () => {
    it("defaults to true when env unset", async () => {
      vi.stubEnv("KATIE_ALWAYS_ON_CONTEXT_ENABLED", "");
      const mod = await import("./flags");
      expect(mod.KATIE_ALWAYS_ON_CONTEXT_ENABLED).toBe(true);
    });

    it('can be disabled via env="false"', async () => {
      vi.stubEnv("KATIE_ALWAYS_ON_CONTEXT_ENABLED", "false");
      const mod = await import("./flags");
      expect(mod.KATIE_ALWAYS_ON_CONTEXT_ENABLED).toBe(false);
    });
  });

  describe("getKatieFlags() — latency build", () => {
    it("includes the three new latency build flags", async () => {
      const mod = await import("./flags");
      const flags = mod.getKatieFlags();
      expect(flags).toHaveProperty("KATIE_PARALLEL_TOOLS_ENABLED");
      expect(flags).toHaveProperty("KATIE_PRELOAD_PASSTHROUGH_ENABLED");
      expect(flags).toHaveProperty("KATIE_ALWAYS_ON_CONTEXT_ENABLED");
    });
  });
});
