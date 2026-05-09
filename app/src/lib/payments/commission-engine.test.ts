/**
 * Commission engine tests — TDD-MANDATORY for cent calculations.
 *
 * Per `06-commission-system.md` §1.5 + §3 (timing).
 */

import { describe, it, expect } from "vitest";
import {
  calculateCommissionCents,
  calculateScheduledReleaseAt,
  calculateCommissionPeriod,
  COMMISSION_CONSTANTS,
} from "./commission-engine";

const A$ = (dollars: number) => Math.round(dollars * 100);

describe("calculateCommissionCents — monthly plan", () => {
  it("monthly + subscription_started → A$100 (10,000 cents)", () => {
    expect(
      calculateCommissionCents({
        plan: "monthly",
        trigger: "subscription_started",
        cycleIndex: 1,
      }),
    ).toBe(A$(100));
  });

  it("monthly + cycle_completed (any cycle) → A$100 (10,000 cents)", () => {
    expect(
      calculateCommissionCents({
        plan: "monthly",
        trigger: "cycle_completed",
        cycleIndex: 1,
      }),
    ).toBe(A$(100));
    // Monthly cycleIndex is always 1 (each call schedules the current
    // cycle), but verify the function doesn't crash on higher values.
    expect(
      calculateCommissionCents({
        plan: "monthly",
        trigger: "cycle_completed",
        cycleIndex: 3,
      }),
    ).toBe(A$(100));
  });
});

describe("calculateCommissionCents — upfront plan", () => {
  it("upfront cycle 1 → 33,333 cents", () => {
    expect(
      calculateCommissionCents({
        plan: "upfront",
        trigger: "subscription_started",
        cycleIndex: 1,
      }),
    ).toBe(33_333);
  });

  it("upfront cycle 2 → 33,333 cents", () => {
    expect(
      calculateCommissionCents({
        plan: "upfront",
        trigger: "cycle_completed",
        cycleIndex: 2,
      }),
    ).toBe(33_333);
  });

  it("upfront cycle 3 → 33,334 cents (remainder)", () => {
    expect(
      calculateCommissionCents({
        plan: "upfront",
        trigger: "cycle_completed",
        cycleIndex: 3,
      }),
    ).toBe(33_334);
  });

  it("3 upfront cycles sum to exactly A$1,000", () => {
    const c1 = calculateCommissionCents({
      plan: "upfront",
      trigger: "subscription_started",
      cycleIndex: 1,
    });
    const c2 = calculateCommissionCents({
      plan: "upfront",
      trigger: "cycle_completed",
      cycleIndex: 2,
    });
    const c3 = calculateCommissionCents({
      plan: "upfront",
      trigger: "cycle_completed",
      cycleIndex: 3,
    });
    expect(c1 + c2 + c3).toBe(A$(1000));
    expect(c1 + c2 + c3).toBe(
      COMMISSION_CONSTANTS.UPFRONT_TOTAL_COMMISSION_CENTS,
    );
  });

  it("upfront cycleIndex out of [1,3] throws (caller bug)", () => {
    expect(() =>
      calculateCommissionCents({
        plan: "upfront",
        trigger: "cycle_completed",
        cycleIndex: 4 as 1 | 2 | 3,
      }),
    ).toThrow(/cycles 1-3/);
    expect(() =>
      calculateCommissionCents({
        plan: "upfront",
        trigger: "subscription_started",
        cycleIndex: 0 as 1 | 2 | 3,
      }),
    ).toThrow(/cycles 1-3/);
  });
});

describe("calculateScheduledReleaseAt — 14-day safeguard window", () => {
  it("subscription_started → paid_period_starts_at + 14 days", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const release = calculateScheduledReleaseAt({
      trigger: "subscription_started",
      paidPeriodStartsAt: start,
    });
    const expected = new Date("2026-01-15T00:00:00Z");
    expect(release.getTime()).toBe(expected.getTime());
  });

  it("cycle_completed → cycle_end + 14 days", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const cycleEnd = new Date("2026-01-31T00:00:00Z");
    const release = calculateScheduledReleaseAt({
      trigger: "cycle_completed",
      paidPeriodStartsAt: start,
      cycleEndsAt: cycleEnd,
    });
    const expected = new Date("2026-02-14T00:00:00Z");
    expect(release.getTime()).toBe(expected.getTime());
  });

  it("cycle_completed without cycleEndsAt → falls back to paidPeriodStartsAt + 14d (defensive)", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const release = calculateScheduledReleaseAt({
      trigger: "cycle_completed",
      paidPeriodStartsAt: start,
    });
    expect(release.getTime()).toBe(new Date("2026-01-15T00:00:00Z").getTime());
  });
});

describe("calculateCommissionPeriod", () => {
  it("subscription_started + trial → covers trial window", () => {
    const trialStart = new Date("2026-01-01T00:00:00Z");
    const trialEnd = new Date("2026-01-31T00:00:00Z");
    const result = calculateCommissionPeriod({
      trigger: "subscription_started",
      paidPeriodStartsAt: new Date("2026-01-31T00:00:00Z"),
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
    });
    expect(result.periodStart.getTime()).toBe(trialStart.getTime());
    expect(result.periodEnd.getTime()).toBe(trialEnd.getTime());
  });

  it("subscription_started without trial → first 30 days of paid period", () => {
    const paidStart = new Date("2026-01-01T00:00:00Z");
    const result = calculateCommissionPeriod({
      trigger: "subscription_started",
      paidPeriodStartsAt: paidStart,
      trialStartedAt: null,
      trialEndsAt: null,
    });
    expect(result.periodStart.getTime()).toBe(paidStart.getTime());
    expect(result.periodEnd.getTime()).toBe(
      new Date("2026-01-31T00:00:00Z").getTime(),
    );
  });

  it("cycle_completed → period covers cycle_end - 30d → cycle_end", () => {
    const cycleEnd = new Date("2026-03-31T00:00:00Z");
    const result = calculateCommissionPeriod({
      trigger: "cycle_completed",
      paidPeriodStartsAt: new Date("2026-01-01T00:00:00Z"),
      cycleEndsAt: cycleEnd,
    });
    expect(result.periodEnd.getTime()).toBe(cycleEnd.getTime());
    // 30 days before cycle end
    expect(result.periodStart.getTime()).toBe(
      new Date("2026-03-01T00:00:00Z").getTime(),
    );
  });
});
