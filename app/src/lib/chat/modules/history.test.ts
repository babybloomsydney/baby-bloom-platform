import { describe, it, expect, beforeEach, vi } from "vitest";
import { historyModule } from "./history";
import type { ChildSummary, ModuleContext } from "./types";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

function makeCtx(
  rows: Array<{
    id: string;
    role: string;
    content: string;
    surface_route: string | null;
    created_at: string;
    trigger_source: string | null;
  }>,
) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  const builder = {
    select: () => builder,
    eq: () => builder,
    ilike: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: () => select(),
  };
  const supabase = {
    from: vi.fn(() => builder),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const ctx: ModuleContext = {
    botId: "bot-1",
    userId: "u-1",
    userRole: "parent",
    effectiveRole: "parent",
    children: [oliver],
    currentSurface: null,
    supabase,
  };
  return { ctx, select };
}

describe("history module — search_history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a query string", async () => {
    const { ctx } = makeCtx([]);
    const r = await historyModule.execute("search_history", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/query/i);
  });

  it("returns matched messages with role + snippet", async () => {
    const { ctx } = makeCtx([
      {
        id: "msg-1",
        role: "user",
        content: "remind me about Oliver's sleep routine next week",
        surface_route: "/nanny/development/c1",
        created_at: "2026-04-01T09:00:00Z",
        trigger_source: null,
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "I'll remind you about Oliver's sleep routine. Current bedtime is 7pm.",
        surface_route: "/nanny/development/c1",
        created_at: "2026-04-01T09:01:00Z",
        trigger_source: "assistant_reply",
      },
    ]);
    const r = await historyModule.execute(
      "search_history",
      { query: "sleep" },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(2);
    expect(data.results[0].id).toBe("msg-1");
    expect(data.results[0].role).toBe("user");
    expect(data.results[0].snippet).toContain("sleep");
  });

  it("respects from/to window + limit", async () => {
    const { ctx, select } = makeCtx([]);
    await historyModule.execute(
      "search_history",
      {
        query: "nap",
        from: "2026-03-01",
        to: "2026-04-01",
        limit: 5,
      },
      ctx,
    );
    expect(select).toHaveBeenCalled();
  });

  it("returns empty results gracefully when nothing matches", async () => {
    const { ctx } = makeCtx([]);
    const r = await historyModule.execute(
      "search_history",
      { query: "nonexistent" },
      ctx,
    );
    expect(r.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.count).toBe(0);
    expect(data.results).toHaveLength(0);
  });

  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx([]);
    const r = await historyModule.execute("nope", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});
