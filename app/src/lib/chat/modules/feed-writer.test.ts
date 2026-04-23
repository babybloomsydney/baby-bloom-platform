import { describe, it, expect, beforeEach, vi } from "vitest";
import { feedWriterModule } from "./feed-writer";
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

describe("feed-writer — create_tile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a custom tile with title + body", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await feedWriterModule.execute(
      "create_tile",
      { title: "Today at the park", body: "Ran for 20 minutes, napped after." },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.feedEntry).toBe(true);
    expect(mocks.insertMock).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.log_id).toBe("tile-new-1");
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

  it("accepts optional image_url", async () => {
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
    expect(mocks.insertMock).toHaveBeenCalled();
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
