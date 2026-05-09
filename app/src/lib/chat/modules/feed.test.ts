import { describe, it, expect } from "vitest";
import { feedModule } from "./feed";
import type { PreloadedContext } from "@/lib/chat/preload/types";

/**
 * Per `Latency:Efficiency/07-test-plan.md §WU6` (read_recent_feed):
 *
 * 1. isPrefulfilled returns true when the requested child name appears in
 *    preload.children_profiles (case-insensitive name match).
 * 2. isPrefulfilled returns false when the array is empty / undefined.
 * 3. isPrefulfilled returns false when the requested child's name is NOT
 *    in the array (Katie asks about Lily; only Oliver in pre-load).
 */

const tool = feedModule.tools.find((t) => t.name === "read_recent_feed")!;

const oliverProfile = {
  child_id: "child-oliver",
  profile: {
    id: "child-oliver",
    first_name: "Oliver",
    date_of_birth: "2024-11-08",
    gender: "male" as const,
    under_three: true,
    status: "active" as const,
  },
};

describe("read_recent_feed.isPrefulfilled", () => {
  it("returns true when the requested child name appears in preload.children_profiles", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T00:00:00Z",
      children_profiles: [oliverProfile],
    };
    expect(tool.isPrefulfilled?.({ child_name: "Oliver" }, preload)).toBe(true);
    // Case-insensitive match.
    expect(tool.isPrefulfilled?.({ child_name: "oliver" }, preload)).toBe(true);
    expect(tool.isPrefulfilled?.({ child_name: "OLIVER" }, preload)).toBe(true);
  });

  it("returns false when children_profiles is empty / undefined", () => {
    expect(
      tool.isPrefulfilled?.(
        { child_name: "Oliver" },
        { as_of: "2026-05-09T00:00:00Z" },
      ),
    ).toBe(false);
    expect(
      tool.isPrefulfilled?.(
        { child_name: "Oliver" },
        { as_of: "2026-05-09T00:00:00Z", children_profiles: [] },
      ),
    ).toBe(false);
    expect(tool.isPrefulfilled?.({ child_name: "Oliver" }, undefined)).toBe(
      false,
    );
  });

  it("returns false when the requested child's name is NOT in the array", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T00:00:00Z",
      children_profiles: [oliverProfile],
    };
    expect(tool.isPrefulfilled?.({ child_name: "Lily" }, preload)).toBe(false);
  });

  // Per silent-failure-hunter HIGH-2 on WU6 — the always-on builder
  // ships at most 10 unfiltered entries per child. Katie asking for
  // a specific type or more than 10 entries cannot be satisfied
  // from pre-load → predicate must refuse the short-circuit so the
  // real handler runs.
  it("returns false when type_filter is supplied (preload is unfiltered)", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T00:00:00Z",
      children_profiles: [oliverProfile],
    };
    expect(
      tool.isPrefulfilled?.(
        { child_name: "Oliver", type_filter: "diary" },
        preload,
      ),
    ).toBe(false);
  });

  it("returns false when limit exceeds the always-on builder's cap (10)", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T00:00:00Z",
      children_profiles: [oliverProfile],
    };
    expect(
      tool.isPrefulfilled?.({ child_name: "Oliver", limit: 25 }, preload),
    ).toBe(false);
    // limit ≤ cap is still allowed.
    expect(
      tool.isPrefulfilled?.({ child_name: "Oliver", limit: 10 }, preload),
    ).toBe(true);
    expect(
      tool.isPrefulfilled?.({ child_name: "Oliver", limit: 5 }, preload),
    ).toBe(true);
  });
});
