import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONNECTION_STAGE } from "@/lib/position/constants";
import type { ModuleContext } from "./types";

// We stub the server actions rather than vi.importActual-ing the real
// module — connection.ts imports Resend at top level, which throws in
// unit-test env without RESEND_API_KEY. The module only uses the two
// functions we expose; re-exports like ConnectionRequestWithDetails are
// type-only and get erased at runtime.
vi.mock("@/lib/actions/connection", () => ({
  getNannyConnectionRequests: vi.fn(),
  getParentConnectionRequests: vi.fn(),
  declineConnectionRequest: vi.fn(),
  cancelConnectionRequest: vi.fn(),
}));

import { connectionsModule } from "./connections";
import {
  getNannyConnectionRequests,
  getParentConnectionRequests,
  declineConnectionRequest,
  cancelConnectionRequest,
} from "@/lib/actions/connection";

function makeCtx(role: "nanny" | "parent" = "nanny"): ModuleContext {
  return {
    botId: "bot-1",
    userId: "u-1",
    userRole: role,
    effectiveRole: role,
    children: [],
    currentSurface: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: vi.fn() } as any,
  };
}

function buildConnection(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "conn-1",
    parent_id: "p-1",
    nanny_id: "n-1",
    position_id: "pos-1",
    status: "pending" as const,
    proposed_times: [],
    confirmed_time: null,
    confirmed_at: null,
    message: null,
    decline_reason: null,
    nanny_phone_shared: null,
    expires_at: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    connection_stage: CONNECTION_STAGE.REQUEST_SENT,
    intro_outcome_reported_at: null,
    fill_initiated_by: null,
    trial_date: null,
    trial_reported_at: null,
    parent: {
      id: "p-1",
      user_id: "pu-1",
      first_name: "Chen",
      last_name: "Family",
      suburb: "Mosman",
    },
    nanny: {
      id: "n-1",
      user_id: "nu-1",
      first_name: "Jessica",
      last_name: "Mahoney",
      suburb: "Bondi",
      hourly_rate_min: 30,
      profile_picture_url: null,
    },
  };
  return { ...base, ...overrides };
}

describe("connections module — role gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects admin role — tells Katie to use admin inspection tools", async () => {
    const ctx = makeCtx();
    ctx.effectiveRole = "admin";
    const r = await connectionsModule.execute("read_connection_inbox", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/nanny and parent/i);
  });

  it("returns error for unknown tool", async () => {
    const r = await connectionsModule.execute("nope", {}, makeCtx());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});

describe("connections module — read_connection_inbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls nanny-side server action when nanny role and returns active only", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT,
        }),
        buildConnection({
          id: "c2",
          connection_stage: CONNECTION_STAGE.DECLINED,
        }),
        buildConnection({
          id: "c3",
          connection_stage: CONNECTION_STAGE.INTRO_SCHEDULED,
        }),
      ],
      error: null,
    });

    const r = await connectionsModule.execute(
      "read_connection_inbox",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    expect(getNannyConnectionRequests).toHaveBeenCalled();
    expect(getParentConnectionRequests).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    // DECLINED filtered out by isTerminal, leaving 2
    expect(data.count).toBe(2);
    expect(data.connections.map((c: { id: string }) => c.id)).toEqual([
      "c1",
      "c3",
    ]);
    expect(data.connections[0].headline).toMatch(/new request/i);
  });

  it("calls parent-side server action when parent role", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1" })],
      error: null,
    });

    const r = await connectionsModule.execute(
      "read_connection_inbox",
      {},
      makeCtx("parent"),
    );
    expect(r.success).toBe(true);
    expect(getParentConnectionRequests).toHaveBeenCalled();
    expect(getNannyConnectionRequests).not.toHaveBeenCalled();
  });

  it("surfaces server action errors", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [],
      error: "Database connection failed",
    });
    const r = await connectionsModule.execute(
      "read_connection_inbox",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe("Database connection failed");
  });
});

describe("connections module — read_connection_by_name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects names shorter than 2 characters", async () => {
    const r = await connectionsModule.execute(
      "read_connection_by_name",
      { counterparty_name: "J" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/at least 2/i);
  });

  it("returns no-match data when no connection matches", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1" })],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_connection_by_name",
      { counterparty_name: "NoSuchName" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.match_count).toBe(0);
  });

  it("returns disambiguation list when multiple match", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          nanny: {
            id: "n1",
            user_id: "u1",
            first_name: "Jessica",
            last_name: "Mahoney",
            suburb: "Bondi",
            hourly_rate_min: 30,
            profile_picture_url: null,
          },
        }),
        buildConnection({
          id: "c2",
          nanny: {
            id: "n2",
            user_id: "u2",
            first_name: "Jessica",
            last_name: "Thompson",
            suburb: "Manly",
            hourly_rate_min: 35,
            profile_picture_url: null,
          },
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_connection_by_name",
      { counterparty_name: "Jessica" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.match_count).toBe(2);
    expect(data.disambiguation).toHaveLength(2);
    // No tile when ambiguous — Katie has to ask first
    expect(r.tile).toBeUndefined();
  });

  it("emits a connection_request tile when exactly one match", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          nanny: {
            id: "n1",
            user_id: "u1",
            first_name: "Jessica",
            last_name: "Mahoney",
            suburb: "Bondi",
            hourly_rate_min: 30,
            profile_picture_url: null,
          },
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_connection_by_name",
      { counterparty_name: "Jessica" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.match_count).toBe(1);
    expect(data.connection.counterparty_name).toBe("Jessica M.");
    expect(r.tile?.kind).toBe("connection_request");
    if (r.tile?.kind === "connection_request") {
      expect(r.tile.data.id).toBe("c1");
    }
  });
});

describe("connections module — read_upcoming_meet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns has_upcoming=false when nothing booked", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1", confirmed_time: null })],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_upcoming_meet",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.has_upcoming).toBe(false);
    expect(r.tile).toBeUndefined();
  });

  it("picks the soonest future confirmed_time and emits a tile", async () => {
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const later = new Date(Date.now() + 2 * 86400_000).toISOString();
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "later",
          confirmed_time: later,
          connection_stage: CONNECTION_STAGE.INTRO_SCHEDULED,
        }),
        buildConnection({
          id: "soon",
          confirmed_time: soon,
          connection_stage: CONNECTION_STAGE.INTRO_SCHEDULED,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_upcoming_meet",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.has_upcoming).toBe(true);
    expect(data.connection.id).toBe("soon");
    expect(r.tile?.kind).toBe("connection_request");
    if (r.tile?.kind === "connection_request") {
      expect(r.tile.data.id).toBe("soon");
    }
  });

  it("ignores past confirmed_times", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "past",
          confirmed_time: "2020-01-01T00:00:00Z",
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_upcoming_meet",
      {},
      makeCtx("nanny"),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.has_upcoming).toBe(false);
  });
});

describe("connections module — read_action_required", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only connections where the CURRENT user has the next move", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "needsMe",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT, // nanny must respond
        }),
        buildConnection({
          id: "waitingOnParent",
          connection_stage: CONNECTION_STAGE.ACCEPTED, // parent picks time
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "read_action_required",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(1);
    expect(data.connections[0].id).toBe("needsMe");
    expect(data.connections[0].next_step).toBeTruthy();
  });
});

describe("connections module — propose_decline_connection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects parent role — only nanny can decline", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1" })],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_decline_connection",
      { connection_id: "c1" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(false);
    expect(r.error?.toLowerCase()).toContain("only nannies");
  });

  it("rejects missing connection_id", async () => {
    const r = await connectionsModule.execute(
      "propose_decline_connection",
      {},
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/connection_id/);
  });

  it("rejects when connection is not in user's list (wrong id)", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1" })],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_decline_connection",
      { connection_id: "does-not-exist" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/No connection found/);
  });

  it("rejects when stage is no longer pending", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.INTRO_SCHEDULED,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_decline_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no longer.+pending|use cancel/i);
  });

  it("returns a preview + does NOT hit the server action", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_decline_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    expect(declineConnectionRequest).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.action).toBe("decline");
    expect(data.email_side_effect).toBe(true);
    expect(data.preview.toLowerCase()).toContain("decline");
    expect(data.preview.toLowerCase()).toContain("neutral notification");
    // Reason is kept private — propose must flag that it's not shared.
    expect(data.preview.toLowerCase()).toContain("never share");
  });
});

describe("connections module — apply_decline_connection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hits the server action when inputs valid", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT,
        }),
      ],
      error: null,
    });
    vi.mocked(declineConnectionRequest).mockResolvedValue({
      success: true,
      error: null,
    });

    const r = await connectionsModule.execute(
      "apply_decline_connection",
      { connection_id: "c1", reason: "private note" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    expect(declineConnectionRequest).toHaveBeenCalledWith("c1", "private note");
    expect(r.tile?.kind).toBe("connection_request");
    if (r.tile?.kind === "connection_request") {
      expect(r.tile.data.id).toBe("c1");
    }
  });

  it("surfaces server-action error verbatim on failure (stage shifted)", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT,
        }),
      ],
      error: null,
    });
    vi.mocked(declineConnectionRequest).mockResolvedValue({
      success: false,
      error: "This request is no longer pending.",
    });
    const r = await connectionsModule.execute(
      "apply_decline_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe("This request is no longer pending.");
  });

  it("is parent-gated — parent calling apply_decline returns error", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.REQUEST_SENT,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "apply_decline_connection",
      { connection_id: "c1" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(false);
    expect(declineConnectionRequest).not.toHaveBeenCalled();
  });
});

describe("connections module — propose_cancel_connection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("previews cancel for a parent-side active connection", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.ACCEPTED,
          nanny: {
            id: "n1",
            user_id: "u1",
            first_name: "Jessica",
            last_name: "Mahoney",
            suburb: "Bondi",
            hourly_rate_min: 30,
            profile_picture_url: null,
          },
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_cancel_connection",
      { connection_id: "c1" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(true);
    expect(cancelConnectionRequest).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.action).toBe("cancel");
    expect(data.email_side_effect).toBe(false);
    expect(data.preview.toLowerCase()).toContain("cancel");
    expect(data.preview).toContain("Jessica M.");
  });

  it("rejects cancel on a terminal stage", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.DECLINED,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_cancel_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already closed/i);
  });

  it("rejects cancel when status is already 'cancelled'", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          status: "cancelled" as const,
          connection_stage: CONNECTION_STAGE.CANCELLED_BY_PARENT,
        }),
      ],
      error: null,
    });
    const r = await connectionsModule.execute(
      "propose_cancel_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/already.+cancelled/i);
  });
});

describe("connections module — apply_cancel_connection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hits the server action + emits live tile on success", async () => {
    vi.mocked(getNannyConnectionRequests).mockResolvedValue({
      data: [
        buildConnection({
          id: "c1",
          connection_stage: CONNECTION_STAGE.ACCEPTED,
        }),
      ],
      error: null,
    });
    vi.mocked(cancelConnectionRequest).mockResolvedValue({
      success: true,
      error: null,
    });
    const r = await connectionsModule.execute(
      "apply_cancel_connection",
      { connection_id: "c1" },
      makeCtx("nanny"),
    );
    expect(r.success).toBe(true);
    expect(cancelConnectionRequest).toHaveBeenCalledWith("c1");
    expect(r.tile?.kind).toBe("connection_request");
  });

  it("surfaces server-action permission error verbatim", async () => {
    vi.mocked(getParentConnectionRequests).mockResolvedValue({
      data: [buildConnection({ id: "c1" })],
      error: null,
    });
    vi.mocked(cancelConnectionRequest).mockResolvedValue({
      success: false,
      error: "You do not have permission to cancel this request.",
    });
    const r = await connectionsModule.execute(
      "apply_cancel_connection",
      { connection_id: "c1" },
      makeCtx("parent"),
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe("You do not have permission to cancel this request.");
  });
});
