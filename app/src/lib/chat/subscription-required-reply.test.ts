/**
 * Tests for the Katie subscription-required templated reply (S6).
 */

import { describe, it, expect } from "vitest";
import { buildKatieSubscriptionRequiredResult } from "./subscription-required-reply";

describe("buildKatieSubscriptionRequiredResult", () => {
  it("returns parent-variant copy for effectiveRole=parent", () => {
    const out = buildKatieSubscriptionRequiredResult("parent", "Lily", "Sarah");
    expect(out.success).toBe(false);
    expect(out.terminal).toBe(true);
    expect(out.error).toMatch(/I'd love to help/);
    expect(out.error).toMatch(/Lily/);
    expect(out.error).toMatch(/Subscribe to continue/i);
    // Parent variant does NOT name the parent in copy (they ARE the parent).
    expect(out.error).not.toMatch(/Sarah/);
  });

  it("returns nanny-variant copy for effectiveRole=nanny", () => {
    const out = buildKatieSubscriptionRequiredResult("nanny", "Lily", "Sarah");
    expect(out.error).toMatch(/I'd love to help/);
    expect(out.error).toMatch(/Lily/);
    expect(out.error).toMatch(/Sarah needs to subscribe/);
  });

  it("falls back to 'the parent' when parent name unknown", () => {
    const out = buildKatieSubscriptionRequiredResult("nanny", "Lily", null);
    expect(out.error).toMatch(/the parent needs to subscribe/i);
  });

  it("attaches structured data for downstream routing", () => {
    const out = buildKatieSubscriptionRequiredResult("parent", "Lily", "Sarah");
    expect(out.data).toEqual({
      reason: "subscription_required",
      child_name: "Lily",
      parent_first_name: "Sarah",
      effective_role: "parent",
    });
  });

  it("does not use banned 'tracking' terminology", () => {
    const cases = [
      buildKatieSubscriptionRequiredResult("parent", "Lily", "Sarah"),
      buildKatieSubscriptionRequiredResult("nanny", "Lily", "Sarah"),
      buildKatieSubscriptionRequiredResult("nanny", "Lily", null),
    ];
    for (const c of cases) {
      expect((c.error ?? "").toLowerCase()).not.toMatch(/\btrack(ing|ed|s)?\b/);
    }
  });
});
