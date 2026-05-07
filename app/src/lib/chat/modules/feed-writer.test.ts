import { describe, it, expect, beforeEach, vi } from "vitest";
import { feedWriterModule, applyCreateTile } from "./feed-writer";
import type { ChildSummary, ModuleContext } from "./types";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

function makeCtx(options?: {
  children?: ChildSummary[];
  existingLog?: {
    id: string;
    child_client_id: string;
    is_active: boolean;
  } | null;
}): {
  ctx: ModuleContext;
  mocks: {
    insertMock: ReturnType<typeof vi.fn>;
    updateMock: ReturnType<typeof vi.fn>;
    getLogMock: ReturnType<typeof vi.fn>;
  };
} {
  const children = options?.children ?? [oliver];
  const existingLog =
    options?.existingLog === undefined
      ? { id: "log-x", child_client_id: "c1", is_active: true }
      : options.existingLog;

  const insertMock = vi.fn().mockResolvedValue({
    data: { id: "tile-new-1" },
    error: null,
  });
  const updateMock = vi.fn().mockResolvedValue({
    data: { id: "tile-new-1" },
    error: null,
  });
  const getLogMock = vi.fn().mockResolvedValue({
    data: existingLog,
    error: null,
  });

  const supabase = {
    from: vi.fn(() => ({
      insert: () => ({
        select: () => ({ single: () => insertMock() }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({ single: () => updateMock() }),
        }),
      }),
      select: () => ({
        eq: () => ({ maybeSingle: () => getLogMock() }),
      }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const ctx: ModuleContext = {
    botId: "bot-1",
    userId: "u-1",
    userRole: "nanny",
    effectiveRole: "nanny",
    children,
    currentSurface: null,
    supabase,
  };
  return { ctx, mocks: { insertMock, updateMock, getLogMock } };
}

// ── Propose path ──────────────────────────────────────────────────────────
//
// WU 8.22d: create_tile now returns a draft tile and does not insert.
// applyCreateTile (below) does the bapp_logs insert when the user
// clicks Accept.

describe("feed-writer — create_tile (propose)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a draft katie_note tile and does NOT insert", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await feedWriterModule.execute(
      "create_tile",
      { title: "Today at the park", body: "Ran for 20 minutes, napped after." },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(mocks.insertMock).not.toHaveBeenCalled();
    expect(r.tile?.kind).toBe("draft");
    if (r.tile?.kind === "draft") {
      expect(r.tile.data.toolName).toBe("create_tile");
      const preview = r.tile.data.preview;
      if (preview.kind === "katie_note") {
        expect(preview.data.title).toBe("Today at the park");
        expect(preview.data.body).toContain("Ran for 20 minutes");
      } else {
        throw new Error(`expected katie_note preview, got ${preview.kind}`);
      }
    }
  });

  it("rejects missing title", async () => {
    const { ctx } = makeCtx();
    const r = await feedWriterModule.execute(
      "create_tile",
      { body: "content but no title" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/title/i);
  });

  it("rejects missing body", async () => {
    const { ctx } = makeCtx();
    const r = await feedWriterModule.execute(
      "create_tile",
      { title: "just a title" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/body|content/i);
  });

  it("threads image_url through into the draft preview without inserting", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await feedWriterModule.execute(
      "create_tile",
      {
        title: "Park visit",
        body: "Here's a photo.",
        image_url: "https://res.cloudinary.com/bb/img/abc.jpg",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(mocks.insertMock).not.toHaveBeenCalled();
    if (r.tile?.kind === "draft") {
      const preview = r.tile.data.preview;
      if (preview.kind === "katie_note") {
        expect(preview.data.image_url).toBe(
          "https://res.cloudinary.com/bb/img/abc.jpg",
        );
      }
    }
  });

  it("surfaces error when child can't be resolved", async () => {
    const { ctx } = makeCtx({ children: [] });
    const r = await feedWriterModule.execute(
      "create_tile",
      { title: "t", body: "b" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/any children/);
  });
});

// ── Apply path ────────────────────────────────────────────────────────────

describe("feed-writer apply — create_tile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and returns the persisted katie_note tile", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await applyCreateTile(
      { title: "Today at the park", body: "Ran for 20 minutes." },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    expect(mocks.insertMock).toHaveBeenCalled();
    if (r.ok) {
      expect(r.tile.kind).toBe("katie_note");
      expect(r.data.log_id).toBe("tile-new-1");
    }
  });

  it("validation failures don't insert", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await applyCreateTile(
      { body: "no title" },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  // A-09 — internal_notes column threading. Uses a custom mock that
  // captures the insert payload so we can assert the exact column
  // shape (the shared makeCtx mock loses the payload).
  it("threads internal_notes into the insert payload when provided", async () => {
    const insertCapture = vi.fn();
    const supabase = {
      from: vi.fn(() => ({
        insert: (payload: unknown) => {
          insertCapture(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "tile-with-notes" },
                  error: null,
                }),
            }),
          };
        },
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const r = await applyCreateTile(
      {
        title: "Park visit",
        body: "Oliver loved the swings today.",
        internal_notes:
          "Parent flagged earlier this week that he was nervous of swings — note the shift.",
      },
      { userId: "u-1", children: [oliver], supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertCapture).toHaveBeenCalledTimes(1);
    const payload = insertCapture.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.internal_notes).toBe(
      "Parent flagged earlier this week that he was nervous of swings — note the shift.",
    );
    // Critical: internal_notes is a TOP-LEVEL column, NOT smuggled
    // into the user-visible `data` JSONB.
    expect(
      (payload.data as Record<string, unknown>).internal_notes,
    ).toBeUndefined();
  });

  it("omits internal_notes from the insert when not provided", async () => {
    const insertCapture = vi.fn();
    const supabase = {
      from: vi.fn(() => ({
        insert: (payload: unknown) => {
          insertCapture(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "tile-x" }, error: null }),
            }),
          };
        },
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await applyCreateTile(
      { title: "T", body: "B" },
      { userId: "u-1", children: [oliver], supabase },
    );
    const payload = insertCapture.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("internal_notes");
  });

  it("treats whitespace-only internal_notes as absent", async () => {
    const insertCapture = vi.fn();
    const supabase = {
      from: vi.fn(() => ({
        insert: (payload: unknown) => {
          insertCapture(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "tile-x" }, error: null }),
            }),
          };
        },
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await applyCreateTile(
      { title: "T", body: "B", internal_notes: "   \n  " },
      { userId: "u-1", children: [oliver], supabase },
    );
    const payload = insertCapture.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("internal_notes");
  });
});

describe("feed-writer — delete_tile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes a tile the user has access to", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await feedWriterModule.execute(
      "delete_tile",
      { log_id: "log-x" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(mocks.updateMock).toHaveBeenCalled();
  });

  it("refuses when log_id is missing", async () => {
    const { ctx } = makeCtx();
    const r = await feedWriterModule.execute("delete_tile", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/log_id/i);
  });

  it("refuses when the log belongs to a child the user doesn't access", async () => {
    const { ctx } = makeCtx({
      existingLog: {
        id: "log-x",
        child_client_id: "SOME-OTHER-CHILD",
        is_active: true,
      },
    });
    const r = await feedWriterModule.execute(
      "delete_tile",
      { log_id: "log-x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not allowed|access|permission/i);
  });

  it("refuses when the log doesn't exist", async () => {
    const { ctx } = makeCtx({ existingLog: null });
    const r = await feedWriterModule.execute(
      "delete_tile",
      { log_id: "log-x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not found|unknown/i);
  });

  it("is idempotent — deleting an already-inactive tile still succeeds", async () => {
    const { ctx, mocks } = makeCtx({
      existingLog: { id: "log-x", child_client_id: "c1", is_active: false },
    });
    const r = await feedWriterModule.execute(
      "delete_tile",
      { log_id: "log-x" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(mocks.updateMock).not.toHaveBeenCalled(); // already inactive
  });
});

describe("feed-writer — common", () => {
  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const r = await feedWriterModule.execute("nope", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});
