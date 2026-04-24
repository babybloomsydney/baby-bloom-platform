import { describe, it, expect, beforeEach, vi } from "vitest";
import { diaryModule } from "./diary";
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

describe("diary module — log_food", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a breakfast with items", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_food",
      { meal_type: "breakfast", items: ["banana", "yogurt"] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.feedEntry).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    // Tile emission — wraps the existing DiaryTile / FoodTile. Must
    // use the canonical FoodData shape so the SAME bapp_logs row also
    // renders correctly in the main feed at /nanny/development/<child>.
    expect(r.tile?.kind).toBe("diary");
    if (r.tile?.kind === "diary") {
      const d = r.tile.data.item.data as Record<string, unknown>;
      expect(d.subtype).toBe("meal");
      expect(d.title).toBe("Food Log");
      expect(d.details).toContain("banana");
      expect(d.details).toContain("breakfast");
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

  it("accepts optional notes and time", async () => {
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
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("diary module — log_sleep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a nap with duration", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await diaryModule.execute(
      "log_sleep",
      { duration_minutes: 90, location: "cot" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.feedEntry).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    expect(r.tile?.kind).toBe("diary");
    if (r.tile?.kind === "diary") {
      const d = r.tile.data.item.data as Record<string, unknown>;
      expect(d.subtype).toBe("sleep");
      expect(d.title).toBe("Sleep Log");
      // duration_minutes=90 → humanDuration → "1h 30m"
      expect(d.duration).toBe("1h 30m");
      expect(String(d.notes)).toContain("cot");
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
