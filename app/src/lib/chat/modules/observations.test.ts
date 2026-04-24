import { describe, it, expect, beforeEach, vi } from "vitest";
import { observationsModule } from "./observations";
import type { ChildSummary, ModuleContext } from "./types";

vi.mock("@/lib/actions/bapp/progress", () => ({
  recalculateProgress: vi.fn().mockResolvedValue(undefined),
  writeHistorySnapshot: vi.fn().mockResolvedValue(undefined),
}));

import {
  recalculateProgress,
  writeHistorySnapshot,
} from "@/lib/actions/bapp/progress";

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
    data: { id: "obs-1" },
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

describe("observations module — log_observation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs a general observation with just a note", async () => {
    const { ctx, insertMock } = makeCtx();
    const r = await observationsModule.execute(
      "log_observation",
      { note: "Shared toys with the cat nicely" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.feedEntry).toBe(true);
    expect(insertMock).toHaveBeenCalled();
    expect(recalculateProgress).not.toHaveBeenCalled();
    expect(writeHistorySnapshot).not.toHaveBeenCalled();
    // Inline chat tile — wraps the existing ObservationTile component
    // so Katie renders the same visual the child feed shows.
    expect(r.tile?.kind).toBe("observation");
    if (r.tile?.kind === "observation") {
      expect(r.tile.data.item.id).toBe("obs-1");
      expect(r.tile.data.item.type).toBe("observation");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((r.tile.data.item.data as any).note).toBe(
        "Shared toys with the cat nicely",
      );
    }
  });

  it("requires a note", async () => {
    const { ctx } = makeCtx();
    const r = await observationsModule.execute(
      "log_observation",
      { note: "" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/note/i);
  });

  it("triggers progress recalc when milestone_id + score provided", async () => {
    const { ctx } = makeCtx();
    const r = await observationsModule.execute(
      "log_observation",
      {
        note: "Said 'mummy' for the first time",
        milestone_id: "CL_12_18_1",
        score: 3,
        domain: "CL",
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(recalculateProgress).toHaveBeenCalledWith("c1", [
      { id: "CL_12_18_1", score: 3 },
    ]);
    expect(writeHistorySnapshot).toHaveBeenCalledWith("c1", "obs-1");
  });

  it("rejects score outside 1-4", async () => {
    const { ctx } = makeCtx();
    const r = await observationsModule.execute(
      "log_observation",
      {
        note: "Counting to 10",
        milestone_id: "NUM_12_18_1",
        score: 9,
      },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/score/i);
  });

  it("does not trigger progress recalc when only milestone_id (no score)", async () => {
    const { ctx } = makeCtx();
    const r = await observationsModule.execute(
      "log_observation",
      { note: "Still working on walking", milestone_id: "PD_12_18_1" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(recalculateProgress).not.toHaveBeenCalled();
  });

  it("surfaces error when child can't be resolved", async () => {
    const { ctx } = makeCtx([]);
    const r = await observationsModule.execute(
      "log_observation",
      { note: "x" },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/any children/);
  });

  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const r = await observationsModule.execute("nope", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});
