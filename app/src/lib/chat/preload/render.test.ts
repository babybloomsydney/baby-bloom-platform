import { describe, it, expect } from "vitest";
import { renderPreloadBlock } from "./render";
import type { PreloadedContext } from "./types";

/**
 * The "Already loaded for you" block is the primary user-visible
 * benefit of WU4 — Katie sees this in her runtime context and (with
 * the WU9 prompt directive) answers from it instead of calling read
 * tools. Tests below verify shape, ordering, and edge cases.
 */

describe("renderPreloadBlock", () => {
  it("returns null when preload is undefined", () => {
    expect(renderPreloadBlock(undefined)).toBeNull();
  });

  it("returns null when preload has no slots (empty object)", () => {
    expect(renderPreloadBlock({})).toBeNull();
  });

  it("returns null when preload has only as_of (no slots populated)", () => {
    expect(renderPreloadBlock({ as_of: "2026-05-09T10:00:00Z" })).toBeNull();
  });

  it("renders a heading + the canonical 'use this directly' nudge", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:00:00Z",
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    });
    expect(block).not.toBeNull();
    expect(block).toContain("## Already loaded for you");
    expect(block).toMatch(/use it directly/i);
  });

  it("renders children_profiles with a heading per child + as_of timestamp", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T10:00:00Z",
      children_profiles: [
        {
          child_id: "c1",
          profile: {
            id: "c1",
            first_name: "Oliver",
            date_of_birth: "2024-11-08",
            gender: "male",
            under_three: true,
            status: "active",
          },
        },
        {
          child_id: "c2",
          profile: {
            id: "c2",
            first_name: "Lily",
            date_of_birth: "2025-09-08",
            gender: "female",
            under_three: true,
            status: "active",
          },
        },
      ],
    };
    const block = renderPreloadBlock(preload);
    expect(block).toContain("Oliver");
    expect(block).toContain("Lily");
    expect(block).toContain("2024-11-08");
    expect(block).toContain("2025-09-08");
    // The "as of" line per the spec.
    expect(block).toMatch(/as of/i);
  });

  it("renders children_recent_feeds with item-count summary per child", () => {
    const preload: PreloadedContext = {
      as_of: "2026-05-09T10:00:00Z",
      children_recent_feeds: [
        {
          child_id: "c1",
          items: Array.from({ length: 5 }, (_, i) => ({
            id: `log-${i}`,
            child_client_id: "c1",
            author_id: "u1",
            type: "diary",
            status: "completed",
            context: "adhoc",
            created_at: `2026-05-0${i + 1}T10:00:00Z`,
            data: { note: `entry ${i}` },
          })) as never,
        },
      ],
    };
    const block = renderPreloadBlock(preload);
    // The block summarises rather than dumping all 10 items as JSON
    // — so we look for the count + the most recent entry's gist.
    expect(block).toContain("c1");
    expect(block).toMatch(/5 entries|5 logs|recent feed/i);
  });

  it("renders my_profile_basics", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:00:00Z",
      my_profile_basics: {
        first_name: "Emma",
        last_name: "Smith",
        role: "nanny",
      },
    });
    expect(block).toContain("Emma");
  });

  it("renders connection_inbox with pending_count", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:00:00Z",
      connection_inbox: {
        pending_count: 3,
        recent: [
          {
            id: "r1",
            partner_name: "Sarah",
            received_at: "2026-05-09T09:00:00Z",
          },
        ],
      },
    });
    expect(block).toContain("3");
    expect(block).toContain("Sarah");
  });

  it("renders verification_status with level + label", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:00:00Z",
      verification_status: {
        level: 4,
        status_code: 40,
        label: "Fully Verified",
        blocking_issues: [],
      },
    });
    expect(block).toContain("Fully Verified");
    expect(block).toContain("4");
  });

  it("includes per-block as_of timestamp inline so Katie can decide on freshness", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:32:01Z",
      my_profile_basics: {
        first_name: "Emma",
        last_name: null,
        role: "nanny",
      },
    });
    // The verbatim timestamp should appear so Katie can read it.
    expect(block).toContain("2026-05-09T10:32:01Z");
  });

  it("orders blocks deterministically (children_profiles before recent_feeds before always-on slots)", () => {
    const block = renderPreloadBlock({
      as_of: "2026-05-09T10:00:00Z",
      verification_status: {
        level: 4,
        status_code: 40,
        label: "Fully Verified",
        blocking_issues: [],
      },
      children_profiles: [
        {
          child_id: "c1",
          profile: {
            id: "c1",
            first_name: "Oliver",
            date_of_birth: "2024-11-08",
            gender: "male",
            under_three: true,
            status: "active",
          },
        },
      ],
    });
    const oliverIdx = block!.indexOf("Oliver");
    const verifiedIdx = block!.indexOf("Fully Verified");
    expect(oliverIdx).toBeGreaterThan(0);
    expect(verifiedIdx).toBeGreaterThan(0);
    // children_profiles renders before verification_status.
    expect(oliverIdx).toBeLessThan(verifiedIdx);
  });
});
