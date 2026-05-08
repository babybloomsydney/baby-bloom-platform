// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

// next/navigation requires the App Router runtime — stub for unit tests.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProgressTile } from "./ProgressTile";
import type { FeedItem, Milestone } from "@/types/bapp";

/**
 * Regression test for the milestone-code leak fix (V1.1 side fix 1).
 *
 * Bug: when ProgressTile was rendered without a milestoneMap (e.g.
 * inside DraftTile's preview), the fallback rendered the raw
 * milestone id (`CL_12_18_1`) directly to the user. ProgressTile
 * now substitutes a user-safe placeholder, so milestone codes
 * NEVER leak to the rendered output regardless of caller behaviour.
 *
 * The regex matches the canonical milestone id pattern in this
 * codebase: `^[A-Z]{2,3}_\d+_\d+_\d+$` (e.g. CL_12_18_1, GMP_24_36_5).
 */

const MILESTONE_ID_PATTERN = /\b[A-Z]{2,3}_\d+_\d+_\d+\b/;

function makeProgressItem(updateIds: string[]): FeedItem {
  return {
    id: "log-1",
    child_client_id: "child-1",
    author_id: "user-1",
    author_name: "Emma",
    type: "progress",
    status: "completed",
    context: "adhoc",
    created_at: "2026-05-07T10:00:00Z",
    updated_at: "2026-05-07T10:00:00Z",
    is_active: true,
    parent_log_id: null,
    internal_notes: null,
    data: {
      title: "Progress update",
      image_url: null,
      note: null,
      updates: updateIds.map((id) => ({ id, score: 3 })),
    },
  } as unknown as FeedItem;
}

describe("ProgressTile — milestone-id leak regression", () => {
  it("renders the milestone description when milestoneMap is provided", () => {
    const milestones = new Map<string, Milestone>([
      [
        "CL_12_18_1",
        {
          id: "CL_12_18_1",
          domain: "Cognitive",
          age_bracket: "12-18",
          description: "Points to named pictures",
          sort_order: 1,
          is_active: true,
        },
      ],
    ]);
    render(
      <ProgressTile
        item={makeProgressItem(["CL_12_18_1"])}
        milestoneMap={milestones}
      />,
    );
    expect(screen.getByText(/Points to named pictures/)).toBeInTheDocument();
    // And critically — the raw id is NOT in the rendered output.
    expect(document.body.textContent).not.toMatch(MILESTONE_ID_PATTERN);
  });

  it("uses a user-safe placeholder when milestoneMap is missing (no code leak)", () => {
    render(<ProgressTile item={makeProgressItem(["CL_12_18_1"])} />);
    // The defensive fallback shows a friendly label, not the id.
    expect(screen.getByText("Milestone update")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(MILESTONE_ID_PATTERN);
  });

  it("never leaks codes even with multiple unknown ids (worst case)", () => {
    render(
      <ProgressTile
        item={makeProgressItem(["CL_12_18_1", "GMP_24_36_5", "SE_6_12_3"])}
      />,
    );
    expect(document.body.textContent).not.toMatch(MILESTONE_ID_PATTERN);
  });

  it("falls back per-row when only some ids are in the map", () => {
    const milestones = new Map<string, Milestone>([
      [
        "CL_12_18_1",
        {
          id: "CL_12_18_1",
          domain: "Cognitive",
          age_bracket: "12-18",
          description: "Points to named pictures",
          sort_order: 1,
          is_active: true,
        },
      ],
    ]);
    render(
      <ProgressTile
        item={makeProgressItem(["CL_12_18_1", "GMP_24_36_5"])}
        milestoneMap={milestones}
      />,
    );
    expect(screen.getByText(/Points to named pictures/)).toBeInTheDocument();
    expect(screen.getByText("Milestone update")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(MILESTONE_ID_PATTERN);
  });
});
