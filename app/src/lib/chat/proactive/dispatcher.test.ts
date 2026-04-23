import { describe, it, expect, beforeEach, vi } from "vitest";
import { inWakingHours, renderTemplate } from "./dispatcher";

describe("inWakingHours", () => {
  it("accepts a time inside the window", () => {
    expect(
      inWakingHours(
        { start: "07:00", end: "22:00", timezone: "Australia/Sydney" },
        new Date("2026-04-23T02:00:00Z"), // 12pm Sydney (AEST UTC+10)
      ),
    ).toBe(true);
  });

  it("rejects before start", () => {
    expect(
      inWakingHours(
        { start: "07:00", end: "22:00", timezone: "Australia/Sydney" },
        new Date("2026-04-22T20:00:00Z"), // 6am Sydney
      ),
    ).toBe(false);
  });

  it("rejects after end", () => {
    expect(
      inWakingHours(
        { start: "07:00", end: "22:00", timezone: "Australia/Sydney" },
        new Date("2026-04-23T14:00:00Z"), // midnight Sydney
      ),
    ).toBe(false);
  });

  it("defaults to Australia/Sydney 07:00–22:00 when settings are missing", () => {
    expect(
      inWakingHours(
        undefined,
        new Date("2026-04-23T02:00:00Z"), // 12pm Sydney
      ),
    ).toBe(true);
  });
});

describe("renderTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("substitutes {child_name} and {today}", () => {
    const out = renderTemplate(
      "Good morning! A reminder about {child_name} for {today}.",
      { child_name: "Oliver", today: "Thursday" },
    );
    expect(out).toBe("Good morning! A reminder about Oliver for Thursday.");
  });

  it("leaves unknown placeholders untouched", () => {
    const out = renderTemplate("Hi {unknown}", {});
    expect(out).toBe("Hi {unknown}");
  });
});
