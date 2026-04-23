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
});
