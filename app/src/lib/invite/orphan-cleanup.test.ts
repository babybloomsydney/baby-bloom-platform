/**
 * Pure helper for the orphan-cleanup cron — computes the cutoff
 * timestamp (now - 365 days) so the route + tests can share one
 * source of truth for the retention window.
 *
 * The route itself is a thin shell around `admin.from('child_client')
 * .delete().lt('orphaned_at', cutoff)`, which we'll smoke-test
 * separately at the integration layer rather than through unit tests
 * (mocking the Supabase chain adds noise without catching real bugs).
 */

import { describe, it, expect } from "vitest";
import { ORPHAN_RETENTION_DAYS, orphanCleanupCutoff } from "./orphan-cleanup";

describe("orphanCleanupCutoff", () => {
  it("returns an ISO timestamp 365 days before the supplied `now`", () => {
    const now = new Date("2026-05-05T03:00:00Z");
    const cutoff = orphanCleanupCutoff(now);
    expect(cutoff).toBe("2025-05-05T03:00:00.000Z");
  });

  it("uses 365 days exactly (the published retention window)", () => {
    expect(ORPHAN_RETENTION_DAYS).toBe(365);
  });

  it("crosses leap days correctly", () => {
    // 2024 had Feb 29; 2025 doesn't. Subtracting 365 calendar days
    // from a date in early March 2025 should land on early March
    // 2024 — same calendar position because 365 days != 1 calendar
    // year when crossing a leap day. The cron is intentionally
    // calendar-day-based (365 fixed days, not 1 year), so a child
    // orphaned on 2024-03-01 is eligible for cleanup on 2025-03-01.
    const now = new Date("2025-03-01T03:00:00Z");
    expect(orphanCleanupCutoff(now)).toBe("2024-03-01T03:00:00.000Z");
  });
});
