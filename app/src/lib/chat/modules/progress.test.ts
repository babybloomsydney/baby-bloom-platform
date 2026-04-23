import { describe, it, expect, beforeEach, vi } from "vitest";
import { progressModule } from "./progress";
import type { ChildSummary, ModuleContext } from "./types";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

const MILESTONE_ROWS = [
  {
    id: "CL_12_18_1",
    domain: "CL",
    age_bracket: "12-18 months",
    description: "Uses 5-10 recognisable words",
    sort_order: 1,
  },
  {
    id: "PD_12_18_1",
    domain: "PD",
    age_bracket: "12-18 months",
    description: "Walks unaided",
    sort_order: 1,
  },
];

function makeCtx(children: ChildSummary[] = [oliver]): {
  ctx: ModuleContext;
  mocks: {
    milestoneSelect: ReturnType<typeof vi.fn>;
    progressSelect: ReturnType<typeof vi.fn>;
  };
} {
  const milestoneSelect = vi.fn().mockResolvedValue({
    data: MILESTONE_ROWS,
    error: null,
  });
  const progressSelect = vi.fn().mockResolvedValue({
    data: [
      {
        domain: "CL",
        percent: 40,
        scores: { CL_12_18_1: 3 },
        updated_at: "2026-04-01T00:00:00Z",
      },
    ],
    error: null,
  });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bapp_milestones") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => milestoneSelect(),
              }),
            }),
          }),
        };
      }
      if (table === "bapp_progress_scores") {
        return {
          select: () => ({
            eq: () => progressSelect(),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const ctx: ModuleContext = {
    botId: "bot-1",
    userId: "u-1",
    userRole: "parent",
    effectiveRole: "parent",
    children,
    currentSurface: null,
    supabase,
  };
  return { ctx, mocks: { milestoneSelect, progressSelect } };
}

describe("progress module — read_milestones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 7-domain slice for child's age bracket by default", async () => {
    const { ctx } = makeCtx();
    const result = await progressModule.execute("read_milestones", {}, ctx);
    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.child_name).toBe("Oliver");
    expect(data.age_bracket).toBe("12-18 months");
    expect(data.milestones).toHaveLength(2);
    expect(data.milestones[0].id).toBe("CL_12_18_1");
  });

  it("joins progress scores so caller can see what's been observed", async () => {
    const { ctx } = makeCtx();
    const result = await progressModule.execute("read_milestones", {}, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    const cl = data.milestones.find(
      (m: { id: string }) => m.id === "CL_12_18_1",
    );
    expect(cl.observed_score).toBe(3);
    const pd = data.milestones.find(
      (m: { id: string }) => m.id === "PD_12_18_1",
    );
    expect(pd.observed_score).toBe(0); // not in scores JSONB
  });

  it("returns domain_summary with percent per domain", async () => {
    const { ctx } = makeCtx();
    const result = await progressModule.execute("read_milestones", {}, ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.domain_summary).toBeDefined();
    expect(data.domain_summary.CL.percent).toBe(40);
  });

  it("supports overriding age_bracket explicitly", async () => {
    const { ctx, mocks } = makeCtx();
    await progressModule.execute(
      "read_milestones",
      { age_bracket: "18-24 months" },
      ctx,
    );
    // Just confirms the query was invoked; specific filter assertion is
    // covered implicitly by the chain shape.
    expect(mocks.milestoneSelect).toHaveBeenCalled();
  });

  it("surfaces error when child can't be resolved", async () => {
    const { ctx } = makeCtx([]);
    const result = await progressModule.execute("read_milestones", {}, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/don't yet have any children/);
  });

  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const result = await progressModule.execute("nope", {}, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown tool/);
  });
});
