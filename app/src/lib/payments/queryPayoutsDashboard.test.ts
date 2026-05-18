/**
 * computeUpcomingEntries — unit tests (T-018).
 *
 * Per spec: system/APP/PAYMENTS/PAYOUTS/07-test-plan.md Layer 6.
 * Covers every family-state combination + projection date math.
 */

import { describe, it, expect } from "vitest";
import { computeUpcomingEntries } from "./queryPayoutsDashboard";

type Sub =
  Parameters<typeof computeUpcomingEntries>[0]["subsByParent"] extends Map<
    string,
    infer S
  >
    ? S
    : never;
type Row = Parameters<typeof computeUpcomingEntries>[0]["payouts"][number];

function family(
  parentId: string,
  parentFirstName: string,
  parentLastName = "Smith",
  childFirstName = "Lily",
) {
  return { parentId, parentFirstName, parentLastName, childFirstName };
}

function sub(
  parent_user_id: string,
  status: Sub["status"],
  overrides: Partial<Sub> = {},
): Sub {
  return {
    parent_user_id,
    status,
    paid_period_starts_at: "2026-05-01T00:00:00+00:00",
    paid_period_ends_at: "2026-06-01T00:00:00+00:00",
    ...overrides,
  };
}

function row(
  parent_user_id: string,
  status: string,
  amount_aud_cents: number,
  scheduled_release_at: string,
  overrides: Partial<Row> = {},
): Row {
  return {
    id: `row-${parent_user_id}-${scheduled_release_at}`,
    parent_user_id,
    amount_aud_cents,
    status,
    scheduled_release_at,
    period_start: scheduled_release_at.slice(0, 10),
    failure_reason: null,
    paid_at: null,
    ...overrides,
  };
}

const NOW = new Date("2026-05-14T00:00:00+00:00");

describe("computeUpcomingEntries", () => {
  it("T6.1: family with no subscription row → 1 locked-trial entry", () => {
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: new Map(),
      payouts: [],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "locked-trial",
      parentFirstName: "Alice",
      familyLabel: "The Smith family",
      amountAudCents: 10_000,
      scheduledReleaseAt: null,
    });
    expect(entries[0]?.caveat).toContain("Pending subscription");
  });

  it("T6.2: family in trial → 1 locked-trial entry", () => {
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: new Map([["p1", sub("p1", "trial")]]),
      payouts: [],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("locked-trial");
  });

  it("T6.3: active_monthly with 1 pending row → 1 real + 5 projected entries (6 total)", () => {
    const subs = new Map([
      [
        "p1",
        sub("p1", "active_monthly", {
          paid_period_ends_at: "2026-06-01T00:00:00+00:00",
        }),
      ],
    ]);
    const pendingRow = row(
      "p1",
      "pending",
      10_000,
      "2026-05-28T00:00:00+00:00",
    );
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [pendingRow],
      now: NOW,
    });
    expect(entries).toHaveLength(6);
    const real = entries.filter((e) => e.kind === "real");
    const projected = entries.filter((e) => e.kind === "projected");
    expect(real).toHaveLength(1);
    expect(projected).toHaveLength(5);
    expect(real[0]?.id).toBe(pendingRow.id);
  });

  it("T6.4: past_due with 1 deferred row → 1 real-deferred entry, no projection", () => {
    const subs = new Map([["p1", sub("p1", "past_due")]]);
    const deferredRow = row(
      "p1",
      "pending",
      10_000,
      "2026-05-28T00:00:00+00:00",
      {
        failure_reason: "past_due_release_deferred",
      },
    );
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [deferredRow],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("real-deferred");
    expect(entries[0]?.caveat).toContain("deferred");
  });

  it("T6.5: active_upfront with 1 pending cycle row → 1 real entry with cycleLabel", () => {
    const subs = new Map([["p1", sub("p1", "active_upfront")]]);
    const cycle2Row = row("p1", "pending", 30_000, "2026-06-15T00:00:00+00:00");
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [cycle2Row],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "real",
      amountAudCents: 30_000,
      cycleLabel: "cycle 2 of 3",
    });
  });

  it("T6.6: cancelled with 1 cancelled row → 1 locked-cancelled entry; cancelled row excluded", () => {
    const subs = new Map([["p1", sub("p1", "cancelled")]]);
    const cancelledRow = row(
      "p1",
      "cancelled",
      10_000,
      "2026-05-28T00:00:00+00:00",
    );
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [cancelledRow],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("locked-cancelled");
    expect(entries[0]?.caveat).toContain("Pending re-subscription");
  });

  it("T6.7: lapsed → 1 locked-lapsed entry", () => {
    const subs = new Map([["p1", sub("p1", "lapsed")]]);
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("locked-lapsed");
    expect(entries[0]?.caveat).toContain("Pending subscription");
  });

  it("T6.8: 5 mixed families → chronological with locked at end", () => {
    const subs = new Map<string, Sub>([
      [
        "p-alice",
        sub("p-alice", "active_monthly", {
          paid_period_ends_at: "2026-06-01T00:00:00+00:00",
        }),
      ],
      ["p-bob", sub("p-bob", "active_upfront")],
      ["p-carol", sub("p-carol", "trial")],
      ["p-dan", sub("p-dan", "cancelled")],
      ["p-erin", sub("p-erin", "lapsed")],
    ]);
    const alicePending = row(
      "p-alice",
      "pending",
      10_000,
      "2026-05-28T00:00:00+00:00",
    );
    const bobCycle2 = row(
      "p-bob",
      "pending",
      30_000,
      "2026-07-01T00:00:00+00:00",
    );
    const entries = computeUpcomingEntries({
      families: [
        family("p-alice", "Alice"),
        family("p-bob", "Bob"),
        family("p-carol", "Carol"),
        family("p-dan", "Dan"),
        family("p-erin", "Erin"),
      ],
      subsByParent: subs,
      payouts: [alicePending, bobCycle2],
      now: NOW,
    });
    // Alice: 1 real + 5 projected = 6. Bob: 1 real. Locked × 3.
    expect(entries.length).toBe(6 + 1 + 3);

    // First entries are chronological (dated). Locked at the end.
    const dated = entries.filter((e) => e.scheduledReleaseAt !== null);
    const locked = entries.filter((e) => e.scheduledReleaseAt === null);
    expect(dated.length).toBe(7);
    expect(locked.length).toBe(3);
    // Locked are at the end of the array.
    const firstLockedIdx = entries.findIndex(
      (e) => e.scheduledReleaseAt === null,
    );
    expect(firstLockedIdx).toBe(7);
    // Dated section sorted ascending.
    for (let i = 1; i < dated.length; i++) {
      expect(
        dated[i - 1]!.scheduledReleaseAt!.localeCompare(
          dated[i]!.scheduledReleaseAt!,
        ),
      ).toBeLessThanOrEqual(0);
    }
  });

  it("T6.9: active_monthly with paid_period_ends_at null → only real, no projection", () => {
    const subs = new Map([
      ["p1", sub("p1", "active_monthly", { paid_period_ends_at: null })],
    ]);
    const pending = row("p1", "pending", 10_000, "2026-05-28T00:00:00+00:00");
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [pending],
      now: NOW,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("real");
  });

  it("T6.11: projection date math — releases at 14d after each cycle end (30d increments)", () => {
    const subs = new Map([
      [
        "p1",
        sub("p1", "active_monthly", {
          paid_period_ends_at: "2026-06-01T00:00:00+00:00",
        }),
      ],
    ]);
    const entries = computeUpcomingEntries({
      families: [family("p1", "Alice")],
      subsByParent: subs,
      payouts: [],
      now: NOW,
    });
    // No real row for this case; only projections. paid_period_ends_at=Jun 1.
    // Cycle i ends Jun 1 + i*30d. Release = +14d.
    expect(entries).toHaveLength(5);
    const releases = entries.map((e) => e.scheduledReleaseAt!);
    expect(releases[0]?.slice(0, 10)).toBe("2026-06-15"); // Jun 1 + 14d
    expect(releases[1]?.slice(0, 10)).toBe("2026-07-15"); // Jul 1 + 14d
    expect(releases[2]?.slice(0, 10)).toBe("2026-08-14"); // Jul 31 + 14d
    expect(releases[3]?.slice(0, 10)).toBe("2026-09-13");
    expect(releases[4]?.slice(0, 10)).toBe("2026-10-13");
  });

  it("each locked entry has its caveat populated", () => {
    const subs = new Map<string, Sub>([
      ["p-carol", sub("p-carol", "trial")],
      ["p-dan", sub("p-dan", "cancelled")],
      ["p-erin", sub("p-erin", "lapsed")],
    ]);
    const entries = computeUpcomingEntries({
      families: [
        family("p-carol", "Carol"),
        family("p-dan", "Dan"),
        family("p-erin", "Erin"),
      ],
      subsByParent: subs,
      payouts: [],
      now: NOW,
    });
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.caveat).toBeTruthy();
      expect(e.scheduledReleaseAt).toBeNull();
      expect(e.amountAudCents).toBe(10_000);
    }
  });

  it("no families → empty list", () => {
    const entries = computeUpcomingEntries({
      families: [],
      subsByParent: new Map(),
      payouts: [],
      now: NOW,
    });
    expect(entries).toEqual([]);
  });
});
