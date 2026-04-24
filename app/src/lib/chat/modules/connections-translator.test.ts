import { describe, it, expect } from "vitest";
import {
  stageHeadline,
  nextStepForUser,
  isTerminal,
  isActionRequired,
  timeLeft,
  counterpartyDisplayName,
} from "./connections-translator";
import { CONNECTION_STAGE } from "@/lib/position/constants";

describe("stageHeadline — role-aware plain English", () => {
  it("speaks differently to parent vs nanny at REQUEST_SENT", () => {
    const parent = stageHeadline(CONNECTION_STAGE.REQUEST_SENT, "parent", {
      counterpartyName: "Jessica M.",
    });
    const nanny = stageHeadline(CONNECTION_STAGE.REQUEST_SENT, "nanny", {
      counterpartyName: "the Chen family",
    });
    expect(parent).toContain("Jessica M.");
    expect(parent.toLowerCase()).toContain("waiting for a response");
    expect(nanny.toLowerCase()).toContain("new request");
    expect(nanny).toContain("the Chen family");
  });

  it("tells parent to pick a time at ACCEPTED, tells nanny to wait", () => {
    const parent = stageHeadline(CONNECTION_STAGE.ACCEPTED, "parent", {
      counterpartyName: "Jessica M.",
    });
    const nanny = stageHeadline(CONNECTION_STAGE.ACCEPTED, "nanny", {
      counterpartyName: "the Chen family",
    });
    expect(parent.toLowerCase()).toContain("pick a time");
    expect(nanny.toLowerCase()).toContain("waiting");
  });

  it("uses 'meet and greet' language at INTRO stages — never 'intro' or 'interview'", () => {
    const scheduled = stageHeadline(
      CONNECTION_STAGE.INTRO_SCHEDULED,
      "parent",
      {
        counterpartyName: "Jessica M.",
      },
    );
    const complete = stageHeadline(CONNECTION_STAGE.INTRO_COMPLETE, "nanny", {
      counterpartyName: "the Chen family",
    });
    for (const text of [scheduled, complete]) {
      expect(text.toLowerCase()).toContain("meet and greet");
      expect(text.toLowerCase()).not.toMatch(/\bintro\b|\binterview\b/);
    }
  });

  it("handles Path A (nanny-initiated OFFERED) with role-appropriate wording", () => {
    const parent = stageHeadline(CONNECTION_STAGE.OFFERED, "parent", {
      counterpartyName: "Jessica M.",
      fillInitiatedBy: "nanny",
    });
    const nanny = stageHeadline(CONNECTION_STAGE.OFFERED, "nanny", {
      counterpartyName: "the Chen family",
      fillInitiatedBy: "nanny",
    });
    expect(parent.toLowerCase()).toContain("confirm");
    expect(nanny.toLowerCase()).toContain("waiting for");
  });

  it("handles Path B (parent-initiated OFFERED) with reversed roles", () => {
    const parent = stageHeadline(CONNECTION_STAGE.OFFERED, "parent", {
      counterpartyName: "Jessica M.",
      fillInitiatedBy: "parent",
    });
    const nanny = stageHeadline(CONNECTION_STAGE.OFFERED, "nanny", {
      counterpartyName: "the Chen family",
      fillInitiatedBy: "parent",
    });
    expect(parent.toLowerCase()).toContain("waiting for");
    expect(nanny.toLowerCase()).toContain("confirm to get started");
  });

  it("never surfaces stage numbers or internal field names", () => {
    const everyStage: number[] = Object.values(CONNECTION_STAGE) as number[];
    for (const stage of everyStage) {
      for (const role of ["parent", "nanny"] as const) {
        const text = stageHeadline(stage, role, {
          counterpartyName: "Test",
          fillInitiatedBy: "nanny",
        });
        expect(text).not.toMatch(/\bstage\s+\d/i);
        expect(text).not.toMatch(/connection_stage|fill_initiated_by/);
        // "intro" banned in favor of "meet and greet"
        expect(text.toLowerCase()).not.toMatch(/\bintro\b(?! )/);
      }
    }
  });
});

describe("nextStepForUser", () => {
  it("returns action for nanny at REQUEST_SENT", () => {
    const step = nextStepForUser(CONNECTION_STAGE.REQUEST_SENT, "nanny");
    expect(step).not.toBeNull();
    expect(step?.toLowerCase()).toContain("accept or decline");
  });

  it("returns null for parent at REQUEST_SENT (waiting on nanny)", () => {
    expect(nextStepForUser(CONNECTION_STAGE.REQUEST_SENT, "parent")).toBeNull();
  });

  it("returns action for parent at ACCEPTED (needs to pick time)", () => {
    const step = nextStepForUser(CONNECTION_STAGE.ACCEPTED, "parent");
    expect(step?.toLowerCase()).toContain("pick a time");
  });

  it("trial arranged with nanny-initiated puts action on parent", () => {
    const parent = nextStepForUser(CONNECTION_STAGE.TRIAL_ARRANGED, "parent", {
      fillInitiatedBy: "nanny",
    });
    const nanny = nextStepForUser(CONNECTION_STAGE.TRIAL_ARRANGED, "nanny", {
      fillInitiatedBy: "nanny",
    });
    expect(parent?.toLowerCase()).toContain("confirm");
    expect(nanny).toBeNull();
  });
});

describe("isTerminal", () => {
  it("flags declined / expired / finished / cancelled as terminal", () => {
    expect(isTerminal(CONNECTION_STAGE.DECLINED)).toBe(true);
    expect(isTerminal(CONNECTION_STAGE.REQUEST_EXPIRED)).toBe(true);
    expect(isTerminal(CONNECTION_STAGE.FINISHED)).toBe(true);
    expect(isTerminal(CONNECTION_STAGE.CANCELLED_BY_PARENT)).toBe(true);
    expect(isTerminal(CONNECTION_STAGE.CANCELLED_BY_NANNY)).toBe(true);
  });

  it("does NOT flag in-play stages as terminal", () => {
    expect(isTerminal(CONNECTION_STAGE.REQUEST_SENT)).toBe(false);
    expect(isTerminal(CONNECTION_STAGE.ACCEPTED)).toBe(false);
    expect(isTerminal(CONNECTION_STAGE.INTRO_SCHEDULED)).toBe(false);
    expect(isTerminal(CONNECTION_STAGE.ACTIVE)).toBe(false);
  });
});

describe("isActionRequired", () => {
  it("true when nextStepForUser is non-null", () => {
    expect(isActionRequired(CONNECTION_STAGE.REQUEST_SENT, "nanny", null)).toBe(
      true,
    );
    expect(isActionRequired(CONNECTION_STAGE.ACCEPTED, "parent", null)).toBe(
      true,
    );
    expect(
      isActionRequired(CONNECTION_STAGE.REQUEST_SENT, "parent", null),
    ).toBe(false);
  });
});

describe("timeLeft", () => {
  it("returns null for null input", () => {
    expect(timeLeft(null)).toBeNull();
  });

  it("returns 'expired' for past dates", () => {
    expect(timeLeft("2020-01-01T00:00:00Z")).toBe("expired");
  });

  it("formats days + hours when > 24h remaining", () => {
    // 2.5 days from now — rounding-tolerant check for "2d Xh left" or "2d left".
    const d = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000);
    expect(timeLeft(d.toISOString())).toMatch(/^2d(\s+\d+h)?\s+left$/);
  });

  it("formats hours when < 24h remaining", () => {
    const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
    expect(timeLeft(d.toISOString())).toMatch(/^[1-5]h\s+left$/);
  });
});

describe("counterpartyDisplayName", () => {
  it("renders first name + last initial", () => {
    expect(counterpartyDisplayName("Jessica", "Mahoney")).toBe("Jessica M.");
  });

  it("handles missing last name gracefully", () => {
    expect(counterpartyDisplayName("Jessica", null)).toBe("Jessica");
    expect(counterpartyDisplayName("Jessica", "")).toBe("Jessica");
  });
});
