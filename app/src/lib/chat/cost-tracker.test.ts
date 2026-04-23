import { describe, it, expect } from "vitest";
import { calculateMessageCost } from "./cost-tracker";
import { GEMINI_MODELS } from "@/lib/ai/model-selector";

describe("calculateMessageCost", () => {
  it("flash: 1M input / 0 out / 0 cached = $0.50", () => {
    expect(
      calculateMessageCost(GEMINI_MODELS.flash, {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cachedTokens: 0,
      }),
    ).toBe(0.5);
  });

  it("flash: 0 input / 1M output / 0 cached = $3.00", () => {
    expect(
      calculateMessageCost(GEMINI_MODELS.flash, {
        inputTokens: 0,
        outputTokens: 1_000_000,
        cachedTokens: 0,
      }),
    ).toBe(3.0);
  });

  it("flash: 0 input / 0 output / 1M cached = $0.05", () => {
    expect(
      calculateMessageCost(GEMINI_MODELS.flash, {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 1_000_000,
      }),
    ).toBe(0.05);
  });

  it("flash: mixed load matches per-doc cost model estimate", () => {
    // Simple reactive turn from COST-MODEL.md: ~3,900 tokens
    // cached 2,200 + fresh input 1,700 + output 300
    const cost = calculateMessageCost(GEMINI_MODELS.flash, {
      inputTokens: 1_700,
      outputTokens: 300,
      cachedTokens: 2_200,
    });
    // (1700 * 0.5 + 300 * 3.0 + 2200 * 0.05) / 1e6
    // = (850 + 900 + 110) / 1e6 = 1860 / 1e6 = 0.00186
    expect(cost).toBeCloseTo(0.00186, 5);
  });

  it("pro is 2.5x flash unit cost on each dimension", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedTokens: 1_000_000,
    };
    const flashCost = calculateMessageCost(GEMINI_MODELS.flash, usage);
    const proCost = calculateMessageCost(GEMINI_MODELS.pro, usage);
    // flash: 0.5 + 3.0 + 0.05 = 3.55
    // pro:   1.25 + 5.0 + 0.125 = 6.375
    expect(flashCost).toBeCloseTo(3.55, 3);
    expect(proCost).toBeCloseTo(6.375, 3);
  });

  it("throws on unknown model", () => {
    expect(() =>
      // @ts-expect-error — intentional invalid model
      calculateMessageCost("gemini-5", {
        inputTokens: 1,
        outputTokens: 1,
        cachedTokens: 0,
      }),
    ).toThrow(/Unknown model/);
  });

  it("handles zero usage", () => {
    expect(
      calculateMessageCost(GEMINI_MODELS.flash, {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      }),
    ).toBe(0);
  });
});
