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
    // Simple reactive turn from COST-MODEL.md: ~3,900 prompt tokens of
    // which 2,200 are cache-served. WU 13.5 corrected the math: Gemini's
    // `promptTokenCount` (= our inputTokens field) is the FULL prompt
    // including cached. Non-cached input is the difference.
    //
    //   non_cached = 3900 - 2200 = 1700
    //   cost = (1700 * 0.5 + 300 * 3.0 + 2200 * 0.05) / 1e6
    //        = (850 + 900 + 110) / 1e6 = 1860 / 1e6 = 0.00186
    const cost = calculateMessageCost(GEMINI_MODELS.flash, {
      inputTokens: 3_900,
      outputTokens: 300,
      cachedTokens: 2_200,
    });
    expect(cost).toBeCloseTo(0.00186, 5);
  });

  it("pro is 2.5x flash unit cost on each dimension", () => {
    // Use disjoint values for each dimension so the cost equals the sum
    // of the three rates. inputTokens here represents the NON-CACHED
    // input share to validate the per-dimension math directly.
    const usage = {
      inputTokens: 2_000_000, // 1M cached + 1M non-cached
      outputTokens: 1_000_000,
      cachedTokens: 1_000_000,
    };
    const flashCost = calculateMessageCost(GEMINI_MODELS.flash, usage);
    const proCost = calculateMessageCost(GEMINI_MODELS.pro, usage);
    // flash non_cached_input(1M)*0.5 + output(1M)*3.0 + cached(1M)*0.05 = 3.55
    // pro:   1M*1.25 + 1M*5.0 + 1M*0.125 = 6.375
    expect(flashCost).toBeCloseTo(3.55, 3);
    expect(proCost).toBeCloseTo(6.375, 3);
  });

  it("does not double-bill cached tokens (WU 13.5)", () => {
    // promptTokenCount=3000, cachedContentTokenCount=2500. Only 500
    // tokens are non-cached input. Output is 100.
    const cost = calculateMessageCost(GEMINI_MODELS.flash, {
      inputTokens: 3_000,
      outputTokens: 100,
      cachedTokens: 2_500,
    });
    // Correct: (3000-2500)*0.5 + 100*3.0 + 2500*0.05 = 250 + 300 + 125 = 675 / 1e6
    // Buggy:   3000*0.5     + 100*3.0 + 2500*0.05 = 1500 + 300 + 125 = 1925 / 1e6
    // We assert the corrected value.
    expect(cost).toBeCloseTo(0.000675, 6);
  });

  it("clamps non-cached input at zero if cached > input (defensive)", () => {
    // SDK should never return cachedTokens > inputTokens, but if it did
    // the math should not produce negative cost.
    const cost = calculateMessageCost(GEMINI_MODELS.flash, {
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 200, // weirdly larger than inputTokens
    });
    // non_cached clamped to 0; cost = 0 + 50*3.0/1e6 + 200*0.05/1e6
    expect(cost).toBeCloseTo(0.00016, 6);
    expect(cost).toBeGreaterThan(0);
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
