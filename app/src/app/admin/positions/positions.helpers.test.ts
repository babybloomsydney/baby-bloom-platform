import { describe, it, expect } from "vitest";
import {
  deriveDfyState,
  connStagesLocal,
  splitConnectionsByOrigin,
  stageTimestamp,
  formatSydneyTime,
  getConnectionStageBadgeVariant,
  dfyMatchStatusVariant,
  dfyMatchStatusLabel,
  type DfyStateInput,
  type ConnRow,
} from "./positions.helpers";

const NOW = new Date("2026-06-03T00:00:00.000Z").getTime();
const FUTURE = new Date("2026-06-10T00:00:00.000Z").toISOString();
const PAST = new Date("2026-05-30T00:00:00.000Z").toISOString();

function dfyInput(p: Partial<DfyStateInput> = {}): DfyStateInput {
  return {
    dfy_activated_at: "2026-06-01T00:00:00.000Z",
    dfy_expires_at: null,
    position_status: 10,
    filled_by_nanny_id: null,
    filled_at: null,
    dfy_tier: "standard",
    dfyMatches: [],
    ...p,
  };
}

function conn(p: Partial<ConnRow> = {}): ConnRow {
  return {
    connection_stage: 0,
    source: null,
    created_at: "2026-06-01T00:00:00.000Z",
    responded_at: null,
    confirmed_at: null,
    intro_outcome_reported_at: null,
    trial_reported_at: null,
    ...p,
  };
}

const interestedRows = (n: number) =>
  Array.from({ length: n }, () => ({ status: "interested" }));

describe("deriveDfyState", () => {
  it("returns none when dfy_activated_at is null", () => {
    expect(deriveDfyState(dfyInput({ dfy_activated_at: null }), NOW).kind).toBe(
      "none",
    );
  });
  it("returns active when activated and no expiry set", () => {
    expect(deriveDfyState(dfyInput({ dfy_expires_at: null }), NOW).kind).toBe(
      "active",
    );
  });
  it("returns active when activated and expiry is in the future", () => {
    expect(deriveDfyState(dfyInput({ dfy_expires_at: FUTURE }), NOW).kind).toBe(
      "active",
    );
  });
  it("returns expired when past expiry and interested below threshold (0)", () => {
    expect(
      deriveDfyState(dfyInput({ dfy_expires_at: PAST, dfyMatches: [] }), NOW)
        .kind,
    ).toBe("expired");
  });
  it("returns expired when interested is exactly one below threshold (4 of 5)", () => {
    expect(
      deriveDfyState(
        dfyInput({ dfy_expires_at: PAST, dfyMatches: interestedRows(4) }),
        NOW,
      ).kind,
    ).toBe("expired");
  });
  it("returns completed at the threshold boundary (5 of 5, standard)", () => {
    expect(
      deriveDfyState(
        dfyInput({ dfy_expires_at: PAST, dfyMatches: interestedRows(5) }),
        NOW,
      ).kind,
    ).toBe("completed");
  });
  it("returns ended_user when position_status >= 50 (Ended)", () => {
    expect(deriveDfyState(dfyInput({ position_status: 50 }), NOW).kind).toBe(
      "ended_user",
    );
  });
  it("returns ended_user for a Closed position (status 60)", () => {
    expect(deriveDfyState(dfyInput({ position_status: 60 }), NOW).kind).toBe(
      "ended_user",
    );
  });
  it("returns ended_system with the real filled_at (not dfy_activated_at) when active + filled", () => {
    const s = deriveDfyState(
      dfyInput({
        dfy_activated_at: "2026-06-01T00:00:00.000Z",
        position_status: 30,
        filled_by_nanny_id: "n1",
        filled_at: "2026-06-02T09:00:00.000Z",
      }),
      NOW,
    );
    expect(s.kind).toBe("ended_system");
    if (s.kind === "ended_system") {
      expect(s.filledAt).toBe("2026-06-02T09:00:00.000Z");
      expect(s.filledAt).not.toBe("2026-06-01T00:00:00.000Z");
    }
  });
  it("ended_user (status>=50) takes precedence over the expiry date logic", () => {
    expect(
      deriveDfyState(
        dfyInput({ position_status: 55, dfy_expires_at: PAST }),
        NOW,
      ).kind,
    ).toBe("ended_user");
  });
});

describe("connStagesLocal", () => {
  it("returns all zero for empty inputs", () => {
    expect(connStagesLocal([], [])).toEqual({
      matched: 0,
      invited: 0,
      applied: 0,
      accepted: 0,
      meet: 0,
      trial: 0,
      offered: 0,
      placed: 0,
    });
  });
  it("counts pending_wave DFY rows as matched", () => {
    expect(
      connStagesLocal(
        [],
        [{ status: "pending_wave" }, { status: "pending_wave" }],
      ).matched,
    ).toBe(2);
  });
  it("counts notified + viewed DFY rows as invited", () => {
    expect(
      connStagesLocal([], [{ status: "notified" }, { status: "viewed" }])
        .invited,
    ).toBe(2);
  });
  it("does not double-count interested DFY rows in the DFY buckets", () => {
    const r = connStagesLocal([], [{ status: "interested" }]);
    expect(r.matched).toBe(0);
    expect(r.invited).toBe(0);
  });
  it("counts connection_stage 4 and 5 as applied", () => {
    expect(
      connStagesLocal([{ connection_stage: 4 }, { connection_stage: 5 }], [])
        .applied,
    ).toBe(2);
  });
  it("counts connection_stage 9 (held) as accepted", () => {
    expect(connStagesLocal([{ connection_stage: 9 }], []).accepted).toBe(1);
  });
  it("counts AWAITING_RESPONSE (30) in the meet bucket", () => {
    expect(connStagesLocal([{ connection_stage: 30 }], []).meet).toBe(1);
  });
  it("excludes terminal stages from every live bucket", () => {
    const terminals = [1, 2, 3, 11, 22, 35, 36, 41, 50, 51].map((s) => ({
      connection_stage: s,
    }));
    const r = connStagesLocal(terminals, []);
    expect(
      r.applied + r.accepted + r.meet + r.trial + r.offered + r.placed,
    ).toBe(0);
  });
  it("counts stages 34 and 40 as placed", () => {
    expect(
      connStagesLocal([{ connection_stage: 34 }, { connection_stage: 40 }], [])
        .placed,
    ).toBe(2);
  });
});

describe("splitConnectionsByOrigin", () => {
  it("routes source=dfy to the dfy bucket regardless of stage", () => {
    expect(
      splitConnectionsByOrigin([conn({ source: "dfy", connection_stage: 20 })])
        .dfy,
    ).toHaveLength(1);
  });
  it("routes source=null stage 0 to parentInitiated", () => {
    expect(
      splitConnectionsByOrigin([conn({ source: null, connection_stage: 0 })])
        .parentInitiated,
    ).toHaveLength(1);
  });
  it("routes source=null stage 4 to nannyApplied", () => {
    expect(
      splitConnectionsByOrigin([conn({ source: null, connection_stage: 4 })])
        .nannyApplied,
    ).toHaveLength(1);
  });
  it("routes source=null stage 5 to nannyApplied", () => {
    expect(
      splitConnectionsByOrigin([conn({ source: null, connection_stage: 5 })])
        .nannyApplied,
    ).toHaveLength(1);
  });
  it("classifies an advanced null-source row (stage 20) as parentInitiated — known best-effort drift", () => {
    // A nanny-applied row born at 4/5 that has advanced past 5 can no longer be told apart from a
    // parent-Connect row (both source=null) until the deferred connection_origin column lands.
    const r = splitConnectionsByOrigin([
      conn({ source: null, connection_stage: 20 }),
    ]);
    expect(r.nannyApplied).toHaveLength(0);
    expect(r.parentInitiated).toHaveLength(1);
  });
});

describe("stageTimestamp", () => {
  it("uses created_at for stages 0/4/5", () => {
    expect(stageTimestamp(conn({ connection_stage: 0, created_at: "C" }))).toBe(
      "C",
    );
    expect(stageTimestamp(conn({ connection_stage: 4, created_at: "C" }))).toBe(
      "C",
    );
    expect(stageTimestamp(conn({ connection_stage: 5, created_at: "C" }))).toBe(
      "C",
    );
  });
  it("uses responded_at for stages 9/10, null when absent", () => {
    expect(
      stageTimestamp(conn({ connection_stage: 10, responded_at: "R" })),
    ).toBe("R");
    expect(
      stageTimestamp(conn({ connection_stage: 9, responded_at: null })),
    ).toBeNull();
  });
  it("uses confirmed_at for stage 20", () => {
    expect(
      stageTimestamp(conn({ connection_stage: 20, confirmed_at: "CF" })),
    ).toBe("CF");
  });
  it("uses intro_outcome_reported_at for stage 21", () => {
    expect(
      stageTimestamp(
        conn({ connection_stage: 21, intro_outcome_reported_at: "IO" }),
      ),
    ).toBe("IO");
  });
  it("uses trial_reported_at for stage 31", () => {
    expect(
      stageTimestamp(conn({ connection_stage: 31, trial_reported_at: "TR" })),
    ).toBe("TR");
  });
  it("returns null for stages with no dedicated column (30 awaiting, 33 offered, 40 active)", () => {
    expect(stageTimestamp(conn({ connection_stage: 30 }))).toBeNull();
    expect(stageTimestamp(conn({ connection_stage: 33 }))).toBeNull();
    expect(stageTimestamp(conn({ connection_stage: 40 }))).toBeNull();
  });
});

describe("formatSydneyTime", () => {
  it("returns an em dash for null or invalid input", () => {
    expect(formatSydneyTime(null)).toBe("—");
    expect(formatSydneyTime("not-a-date")).toBe("—");
  });
  it("formats a valid ISO string as a Sydney day/month + time", () => {
    const out = formatSydneyTime("2026-06-03T05:30:00.000Z");
    expect(out).toMatch(/Jun/); // month: short
    expect(out).toMatch(/\d{1,2}:\d{2}/); // hour:minute
  });
});

describe("getConnectionStageBadgeVariant", () => {
  it("returns inactive for null", () => {
    expect(getConnectionStageBadgeVariant(null)).toBe("inactive");
  });
  it("maps REQUEST_SENT (0) to pending", () => {
    expect(getConnectionStageBadgeVariant(0)).toBe("pending");
  });
  it("maps applied/accepted incl. held variants (4/5/9/10) to info", () => {
    expect(getConnectionStageBadgeVariant(4)).toBe("info");
    expect(getConnectionStageBadgeVariant(5)).toBe("info");
    expect(getConnectionStageBadgeVariant(9)).toBe("info");
    expect(getConnectionStageBadgeVariant(10)).toBe("info");
  });
  it("maps meet/awaiting/offered (20/30/33) to verified", () => {
    expect(getConnectionStageBadgeVariant(20)).toBe("verified");
    expect(getConnectionStageBadgeVariant(30)).toBe("verified");
    expect(getConnectionStageBadgeVariant(33)).toBe("verified");
  });
  it("maps confirmed/active (34/40) to active", () => {
    expect(getConnectionStageBadgeVariant(34)).toBe("active");
    expect(getConnectionStageBadgeVariant(40)).toBe("active");
  });
  it("maps declined/not-hired/cancelled (2/35/50) to failed", () => {
    expect(getConnectionStageBadgeVariant(2)).toBe("failed");
    expect(getConnectionStageBadgeVariant(35)).toBe("failed");
    expect(getConnectionStageBadgeVariant(50)).toBe("failed");
  });
  it("maps expired/finished/incomplete (1/11/41) to inactive", () => {
    expect(getConnectionStageBadgeVariant(1)).toBe("inactive");
    expect(getConnectionStageBadgeVariant(11)).toBe("inactive");
    expect(getConnectionStageBadgeVariant(41)).toBe("inactive");
  });
});

describe("dfyMatchStatusVariant", () => {
  it("maps each known status to its variant", () => {
    expect(dfyMatchStatusVariant("pending_wave")).toBe("pending");
    expect(dfyMatchStatusVariant("notified")).toBe("info");
    expect(dfyMatchStatusVariant("viewed")).toBe("info");
    expect(dfyMatchStatusVariant("interested")).toBe("verified");
    expect(dfyMatchStatusVariant("declined")).toBe("failed");
    expect(dfyMatchStatusVariant("expired")).toBe("inactive");
  });
  it("falls back to inactive for an unknown status", () => {
    expect(dfyMatchStatusVariant("approved")).toBe("inactive");
  });
});

describe("dfyMatchStatusLabel", () => {
  it("maps each known status to a human label", () => {
    expect(dfyMatchStatusLabel("pending_wave")).toBe("Matched");
    expect(dfyMatchStatusLabel("notified")).toBe("Contacted");
    expect(dfyMatchStatusLabel("viewed")).toBe("Viewed");
    expect(dfyMatchStatusLabel("interested")).toBe("Interested");
    expect(dfyMatchStatusLabel("declined")).toBe("Declined");
    expect(dfyMatchStatusLabel("expired")).toBe("Expired");
  });
  it("passes an unknown status through as the label", () => {
    expect(dfyMatchStatusLabel("approved")).toBe("approved");
  });
});
