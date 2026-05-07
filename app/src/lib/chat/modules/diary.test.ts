import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  diaryModule,
  applyLogFood,
  applyLogSleep,
  applyLogUpdate,
} from "./diary";
import type { ChildSummary, ModuleContext } from "./types";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

function makeCtx(children: ChildSummary[] = [oliver]): {
  ctx: ModuleContext;
  insertMock: ReturnType<typeof vi.fn>;
} {
  const insertMock = vi.fn().mockResolvedValue({
    data: { id: "log-1" },
    error: null,
  });

  const supabase = {
    from: vi.fn(() => ({
      insert: () => ({
        select: () => ({
          single: () => insertMock(),
        }),
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
  return { ctx, insertMock };
}

// ── Propose path (LLM-callable via diaryModule.execute) ───────────────────
//
// WU 8.22c: log_food / log_sleep no longer insert directly. They
// validate args and return a `kind: "draft"` tile. The actual
// bapp_logs insert happens later via applyLogFood / applyLogSleep
// when the user clicks Accept on the draft tile.

describe("diary module — log_food (propose)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a draft tile and does NOT insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_food",
      { meal_type: "breakfast", items: ["banana", "yogurt"] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
    expect(r.tile?.kind).toBe("draft");
    if (r.tile?.kind === "draft") {
      expect(r.tile.data.toolName).toBe("log_food");
      expect(typeof r.tile.data.draftId).toBe("string");
      const preview = r.tile.data.preview;
      expect(preview.kind).toBe("diary");
      if (preview.kind === "diary") {
        const previewData = preview.data.item.data as Record<string, unknown>;
        expect(previewData.subtype).toBe("meal");
        expect(previewData.title).toBe("Food Log");
        expect(previewData.details).toContain("banana");
        expect(previewData.details).toContain("breakfast");
      }
    }
  });

  it("rejects unknown meal_type", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_food",
      { meal_type: "brunch", items: ["toast"] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/meal_type/);
  });

  it("requires at least one item", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_food",
      { meal_type: "lunch", items: [] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/item/i);
  });

  it("accepts optional notes and time without inserting", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_food",
      {
        meal_type: "snack",
        items: ["apple"],
        time: "10:30",
        notes: "ate all of it",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("diary module — log_sleep (propose)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a draft tile and does NOT insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_sleep",
      { duration_minutes: 90, location: "cot" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
    expect(r.tile?.kind).toBe("draft");
    if (r.tile?.kind === "draft") {
      expect(r.tile.data.toolName).toBe("log_sleep");
      const preview = r.tile.data.preview;
      if (preview.kind === "diary") {
        const previewData = preview.data.item.data as Record<string, unknown>;
        expect(previewData.subtype).toBe("sleep");
        expect(previewData.title).toBe("Sleep Log");
        expect(previewData.duration).toBe("1h 30m");
        expect(String(previewData.notes)).toContain("cot");
      } else {
        throw new Error(`expected diary preview, got ${preview.kind}`);
      }
    }
  });

  it("rejects negative or zero duration", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_sleep",
      { duration_minutes: 0 },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/duration/i);
  });

  it("rejects absurdly long sleeps", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_sleep",
      { duration_minutes: 2000 }, // >24h
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/duration/i);
  });
});

describe("diary module — common", () => {
  it("surfaces error when child can't be resolved", async () => {
    const { ctx } = makeCtx([]);
    const r = await diaryModule.execute(
      "log_food",
      { meal_type: "lunch", items: ["rice"] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/any children/);
  });

  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute("log_nap", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});

// ── Apply path — called by /api/chat/drafts/accept ────────────────────────

describe("diary apply — log_food", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and returns a persisted diary tile", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogFood(
      { meal_type: "breakfast", items: ["banana", "yogurt"] },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    if (r.ok) {
      expect(r.tile.kind).toBe("diary");
      expect(r.tile.data.item.id).toBe("log-1");
      expect(r.data.log_id).toBe("log-1");
    }
  });

  it("merges image_url into the persisted shape when provided", async () => {
    const { ctx } = makeCtx();
    const r = await applyLogFood(
      {
        meal_type: "breakfast",
        items: ["banana"],
        image_url: "https://example.com/banana.jpg",
      },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.tile.data.item.data as Record<string, unknown>;
      expect(d.image_url).toBe("https://example.com/banana.jpg");
    }
  });

  it("returns an error result if the insert fails", async () => {
    const { ctx, insertMock } = makeCtx();
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const r = await applyLogFood(
      { meal_type: "lunch", items: ["rice"] },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Failed to log food/);
    }
  });

  it("validation failures don't insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogFood(
      { meal_type: "brunch", items: ["x"] },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("diary apply — log_sleep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and returns a persisted diary tile", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogSleep(
      { duration_minutes: 60 },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    if (r.ok) {
      expect(r.tile.kind).toBe("diary");
      const d = r.tile.data.item.data as Record<string, unknown>;
      expect(d.subtype).toBe("sleep");
      expect(d.duration).toBe("1h");
    }
  });

  it("merges image_url into the persisted shape when provided", async () => {
    const { ctx } = makeCtx();
    const r = await applyLogSleep(
      {
        duration_minutes: 45,
        image_url: "https://example.com/cot.jpg",
      },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = r.tile.data.item.data as Record<string, unknown>;
      expect(d.image_url).toBe("https://example.com/cot.jpg");
    }
  });

  it("returns an error result if the insert fails", async () => {
    const { ctx, insertMock } = makeCtx();
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const r = await applyLogSleep(
      { duration_minutes: 30 },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Failed to log sleep/);
    }
  });

  it("validation failures don't insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogSleep(
      { duration_minutes: 99999 }, // > MAX_SLEEP_MINUTES
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ── Propose + apply for the new free-form Update entry ─────────────

describe("diary module — log_update (propose)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a draft tile labelled 'Diary Entry' and does NOT insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_update",
      { note: "Had a great morning at the park with Oliver." },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
    expect(r.tile?.kind).toBe("draft");
    if (r.tile?.kind === "draft") {
      expect(r.tile.data.toolName).toBe("log_update");
      expect(typeof r.tile.data.draftId).toBe("string");
      const preview = r.tile.data.preview;
      expect(preview.kind).toBe("diary");
      if (preview.kind === "diary") {
        const previewData = preview.data.item.data as Record<string, unknown>;
        expect(previewData.subtype).toBe("update");
        expect(previewData.title).toBe("Diary Entry");
        expect(previewData.note).toBe(
          "Had a great morning at the park with Oliver.",
        );
        expect(previewData.image_url).toBeNull();
      }
    }
  });

  it("trims whitespace on the note", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_update",
      { note: "   Park visit.   " },
      ctx,
    );
    expect(r.success).toBe(true);
    if (r.success && r.tile?.kind === "draft") {
      const preview = r.tile.data.preview;
      if (preview.kind === "diary") {
        expect((preview.data.item.data as Record<string, unknown>).note).toBe(
          "Park visit.",
        );
      }
    }
  });

  it("rejects empty note", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute("log_update", { note: "   " }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/note/);
  });

  it("rejects missing note", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute("log_update", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/note/);
  });

  it("threads image_url through into the draft preview", async () => {
    const { ctx } = makeCtx();
    const r = await diaryModule.execute(
      "log_update",
      { note: "Beach day", image_url: "https://example.com/img.jpg" },
      ctx,
    );
    expect(r.success).toBe(true);
    if (r.success && r.tile?.kind === "draft") {
      const preview = r.tile.data.preview;
      if (preview.kind === "diary") {
        expect(
          (preview.data.item.data as Record<string, unknown>).image_url,
        ).toBe("https://example.com/img.jpg");
      }
    }
  });
});

describe("diary apply — log_update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a diary log with subtype='update' and returns the persisted tile", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogUpdate(
      { note: "First swim lesson today!" },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    if (r.ok) {
      expect(r.data.log_id).toBe("log-1");
      expect(r.tile.kind).toBe("diary");
      const persisted = r.tile.data.item.data as Record<string, unknown>;
      expect(persisted.subtype).toBe("update");
      expect(persisted.title).toBe("Diary Entry");
      expect(persisted.note).toBe("First swim lesson today!");
    }
  });

  it("validation failures don't insert", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await applyLogUpdate(
      { note: "" },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("surfaces insert errors", async () => {
    const { ctx, insertMock } = makeCtx();
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const r = await applyLogUpdate(
      { note: "Park visit." },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Failed to save diary update/);
    }
  });
});
