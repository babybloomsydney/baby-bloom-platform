/**
 * deriveFamilyPayoutState — unit tests for the S12 state machine.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deriveFamilyPayoutState,
  getSubStateIcon,
  type FamilyPayoutInputs,
} from "./payouts-state";

const NOW = new Date("2026-05-11T00:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeInputs(o: Partial<FamilyPayoutInputs> = {}): FamilyPayoutInputs {
  return {
    subscriptionStatus: "trial",
    paidStartedAt: null,
    hasUsedTrial: true,
    hasPaidPayouts: false,
    ...o,
  };
}

describe("deriveFamilyPayoutState", () => {
  it("State A — null subscription (never subscribed)", () => {
    expect(
      deriveFamilyPayoutState(makeInputs({ subscriptionStatus: null })),
    ).toBe("A");
  });

  it("State A — trial in progress", () => {
    expect(
      deriveFamilyPayoutState(makeInputs({ subscriptionStatus: "trial" })),
    ).toBe("A");
  });

  it("State B — within 14-day safeguard, no payouts yet", () => {
    const sevenDaysAgo = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "active_monthly",
          paidStartedAt: sevenDaysAgo,
          hasPaidPayouts: false,
        }),
      ),
    ).toBe("B");
  });

  it("State C — past safeguard window, has past payouts", () => {
    const thirtyDaysAgo = new Date(
      NOW - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "active_monthly",
          paidStartedAt: thirtyDaysAgo,
          hasPaidPayouts: true,
        }),
      ),
    ).toBe("C");
  });

  it("State C — past safeguard, no payouts (15+ days in)", () => {
    const fifteenDaysAgo = new Date(
      NOW - 15 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "active_monthly",
          paidStartedAt: fifteenDaysAgo,
          hasPaidPayouts: false,
        }),
      ),
    ).toBe("C");
  });

  it("State D — cancelled (with or without payouts)", () => {
    expect(
      deriveFamilyPayoutState(
        makeInputs({ subscriptionStatus: "cancelled", hasPaidPayouts: true }),
      ),
    ).toBe("D");
    expect(
      deriveFamilyPayoutState(
        makeInputs({ subscriptionStatus: "cancelled", hasPaidPayouts: false }),
      ),
    ).toBe("D");
  });

  it("State E — lapsed with no past payouts (trial expired without subscribing)", () => {
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "lapsed",
          hasPaidPayouts: false,
          hasUsedTrial: true,
        }),
      ),
    ).toBe("E");
  });

  it("State D — lapsed with past payouts (fully cancelled after paying)", () => {
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "lapsed",
          hasPaidPayouts: true,
        }),
      ),
    ).toBe("D");
  });

  it("active_upfront treated same as active_monthly for state derivation", () => {
    const thirtyDaysAgo = new Date(
      NOW - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      deriveFamilyPayoutState(
        makeInputs({
          subscriptionStatus: "active_upfront",
          paidStartedAt: thirtyDaysAgo,
          hasPaidPayouts: true,
        }),
      ),
    ).toBe("C");
  });
});

describe("getSubStateIcon", () => {
  it("returns the expected icon per state", () => {
    expect(getSubStateIcon("A")).toBe("🔒");
    expect(getSubStateIcon("B")).toBe("⏳");
    expect(getSubStateIcon("C")).toBe("");
    expect(getSubStateIcon("D")).toBe("❄️");
    expect(getSubStateIcon("E")).toBe("❄️");
  });
});
