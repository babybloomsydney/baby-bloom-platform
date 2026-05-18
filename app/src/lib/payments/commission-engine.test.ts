/**
 * Commission engine tests — TDD-MANDATORY for cent calculations.
 *
 * Rewritten 2026-05-13 against the engine signature lock-in:
 * - Monthly: A$100, released 14 days after each parent payment.
 * - Upfront: A$500 / A$300 / A$200 at +30d / +60d / +90d.
 */

import { describe, it, expect } from "vitest";
import {
  calculateCommissionCents,
  calculateScheduledReleaseAt,
  calculateCommissionPeriod,
  COMMISSION_CONSTANTS,
} from "./commission-engine";

const A$ = (dollars: number) => Math.round(dollars * 100);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FIXED_PAYMENT = new Date("2026-01-15T00:00:00Z");

describe("calculateCommissionCents — monthly plan", () => {
  it("monthly always returns A$100 (10,000 cents)", () => {
    expect(calculateCommissionCents({ plan: "monthly", cycleIndex: 1 })).toBe(
      A$(100),
    );
    expect(calculateCommissionCents({ plan: "monthly", cycleIndex: 2 })).toBe(
      A$(100),
    );
    expect(calculateCommissionCents({ plan: "monthly", cycleIndex: 3 })).toBe(
      A$(100),
    );
  });
});

describe("calculateCommissionCents — upfront plan", () => {
  it("upfront cycle 1 → A$500 (50,000 cents)", () => {
    expect(calculateCommissionCents({ plan: "upfront", cycleIndex: 1 })).toBe(
      A$(500),
    );
  });

  it("upfront cycle 2 → A$300 (30,000 cents)", () => {
    expect(calculateCommissionCents({ plan: "upfront", cycleIndex: 2 })).toBe(
      A$(300),
    );
  });

  it("upfront cycle 3 → A$200 (20,000 cents)", () => {
    expect(calculateCommissionCents({ plan: "upfront", cycleIndex: 3 })).toBe(
      A$(200),
    );
  });

  it("3 upfront cycles sum to exactly A$1,000", () => {
    const c1 = calculateCommissionCents({ plan: "upfront", cycleIndex: 1 });
    const c2 = calculateCommissionCents({ plan: "upfront", cycleIndex: 2 });
    const c3 = calculateCommissionCents({ plan: "upfront", cycleIndex: 3 });
    expect(c1 + c2 + c3).toBe(A$(1000));
    expect(c1 + c2 + c3).toBe(
      COMMISSION_CONSTANTS.UPFRONT_TOTAL_COMMISSION_CENTS,
    );
  });

  it("upfront cycleIndex out of [1,3] throws (caller bug)", () => {
    expect(() =>
      calculateCommissionCents({
        plan: "upfront",
        cycleIndex: 4 as 1 | 2 | 3,
      }),
    ).toThrow(/cycleIndex must be 1-3/);
    expect(() =>
      calculateCommissionCents({
        plan: "upfront",
        cycleIndex: 0 as 1 | 2 | 3,
      }),
    ).toThrow(/cycleIndex must be 1-3/);
  });

  it("monthly cycleIndex out of [1,3] also throws (M4 — caller-bug guard)", () => {
    // Defensive: the type constraint already says 1|2|3, but a caller
    // that widens to `number` (cron, untyped event payload) would
    // otherwise silently get back the flat $100. Throw instead.
    expect(() =>
      calculateCommissionCents({
        plan: "monthly",
        cycleIndex: 0 as 1 | 2 | 3,
      }),
    ).toThrow(/cycleIndex must be 1-3/);
    expect(() =>
      calculateCommissionCents({
        plan: "monthly",
        cycleIndex: 4 as 1 | 2 | 3,
      }),
    ).toThrow(/cycleIndex must be 1-3/);
  });
});

describe("calculateScheduledReleaseAt — monthly = payment + 14d", () => {
  it("monthly → paymentLandedAt + 14 days", () => {
    const release = calculateScheduledReleaseAt({
      plan: "monthly",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 1,
    });
    expect(release.getTime() - FIXED_PAYMENT.getTime()).toBe(14 * MS_PER_DAY);
  });
});

describe("calculateScheduledReleaseAt — upfront = payment + 30/60/90d", () => {
  it("upfront cycle 1 → paymentLandedAt + 30 days", () => {
    const release = calculateScheduledReleaseAt({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 1,
    });
    expect(release.getTime() - FIXED_PAYMENT.getTime()).toBe(30 * MS_PER_DAY);
  });

  it("upfront cycle 2 → paymentLandedAt + 60 days", () => {
    const release = calculateScheduledReleaseAt({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 2,
    });
    expect(release.getTime() - FIXED_PAYMENT.getTime()).toBe(60 * MS_PER_DAY);
  });

  it("upfront cycle 3 → paymentLandedAt + 90 days", () => {
    const release = calculateScheduledReleaseAt({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 3,
    });
    expect(release.getTime() - FIXED_PAYMENT.getTime()).toBe(90 * MS_PER_DAY);
  });
});

describe("calculateCommissionPeriod — monthly = single 30d window", () => {
  it("monthly → period_start=paymentLandedAt, period_end=+30d", () => {
    const period = calculateCommissionPeriod({
      plan: "monthly",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 1,
    });
    expect(period.periodStart.getTime()).toBe(FIXED_PAYMENT.getTime());
    expect(period.periodEnd.getTime() - FIXED_PAYMENT.getTime()).toBe(
      30 * MS_PER_DAY,
    );
  });
});

describe("calculateCommissionPeriod — upfront = three sequential 30d windows", () => {
  it("upfront cycle 1 → first 30d window after payment", () => {
    const period = calculateCommissionPeriod({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 1,
    });
    expect(period.periodStart.getTime()).toBe(FIXED_PAYMENT.getTime());
    expect(period.periodEnd.getTime() - FIXED_PAYMENT.getTime()).toBe(
      30 * MS_PER_DAY,
    );
  });

  it("upfront cycle 2 → second 30d window (30-60d after payment)", () => {
    const period = calculateCommissionPeriod({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 2,
    });
    expect(period.periodStart.getTime() - FIXED_PAYMENT.getTime()).toBe(
      30 * MS_PER_DAY,
    );
    expect(period.periodEnd.getTime() - FIXED_PAYMENT.getTime()).toBe(
      60 * MS_PER_DAY,
    );
  });

  it("upfront cycle 3 → third 30d window (60-90d after payment)", () => {
    const period = calculateCommissionPeriod({
      plan: "upfront",
      paymentLandedAt: FIXED_PAYMENT,
      cycleIndex: 3,
    });
    expect(period.periodStart.getTime() - FIXED_PAYMENT.getTime()).toBe(
      60 * MS_PER_DAY,
    );
    expect(period.periodEnd.getTime() - FIXED_PAYMENT.getTime()).toBe(
      90 * MS_PER_DAY,
    );
  });
});
