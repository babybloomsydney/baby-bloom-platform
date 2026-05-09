import { describe, it, expect } from "vitest";
import { childProfileModule } from "./child-profile";
import type { PreloadedContext } from "@/lib/chat/preload/types";

/**
 * Per `Latency:Efficiency/07-test-plan.md §WU6` (read_child_profile):
 * Same three predicate cases as read_recent_feed — child-name match
 * against preload.children_profiles.
 */

const tool = childProfileModule.tools.find(
  (t) => t.name === "read_child_profile",
)!;

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

describe("read_child_profile.isPrefulfilled", () => {
  it("returns true when the requested child name appears in preload.children_profiles", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T00:00:00Z",
      children_profiles: [oliverProfile],
    };
    expect(tool.isPrefulfilled?.({ child_name: "Oliver" }, preload)).toBe(true);
    expect(tool.isPrefulfilled?.({ child_name: "oliver" }, preload)).toBe(true);
  });

  it("returns false when children_profiles is empty / undefined", () => {
    expect(
      tool.isPrefulfilled?.(
        { child_name: "Oliver" },
        { as_of: "2026-05-09T00:00:00Z" },
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
});
