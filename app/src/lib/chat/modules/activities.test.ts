import { describe, it, expect, beforeEach, vi } from "vitest";
import { activitiesModule } from "./activities";
import type { ChildSummary, ModuleContext } from "./types";

vi.mock("@/lib/ai/client", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  creativeName: "Banana Breakfast Bonanza",
                  description: "Build counting skills while eating breakfast.",
                  steps: ["Offer banana", "Ask how many", "Reward"],
                  milestone_domains: ["NUM"],
                }),
              },
            },
          ],
        }),
      },
    },
  },
}));

vi.mock("@/lib/ai/prompts/bapp-activity-generation", () => ({
  ACTIVITY_SYSTEM_PROMPT: "sys",
  buildActivityUserPrompt: () => "user-prompt",
}));

import { openai } from "@/lib/ai/client";

const oliver: ChildSummary = {
  id: "c1",
  firstName: "Oliver",
  ageMonths: 14,
  ageBracket: "12-18 months",
  gender: "male",
};

function makeCtx(children: ChildSummary[] = [oliver]) {
  const milestoneSelect = vi.fn().mockResolvedValue({
    data: [
      {
        id: "NUM_12_18_1",
        domain: "NUM",
        age_bracket: "12-18 months",
        description: "Recognises 1-3 quantities",
      },
    ],
    error: null,
  });
  const insertMock = vi.fn().mockResolvedValue({
    data: { id: "log-act-1" },
    error: null,
  });
  const updateMock = vi.fn().mockResolvedValue({ data: null, error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bapp_milestones") {
        return {
          select: () => ({
            in: () => milestoneSelect(),
          }),
        };
      }
      if (table === "bapp_logs") {
        return {
          insert: () => ({
            select: () => ({
              single: () => insertMock(),
            }),
          }),
          update: () => ({
            eq: () => updateMock(),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
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
  return { ctx, mocks: { milestoneSelect, insertMock, updateMock } };
}

describe("activities module — plan_activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires at least one milestone_id", async () => {
    const { ctx } = makeCtx();
    const r = await activitiesModule.execute(
      "plan_activity",
      { milestone_ids: [] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/milestone/i);
  });

  it("creates a pending log, calls OpenAI, updates with the plan", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await activitiesModule.execute(
      "plan_activity",
      { milestone_ids: ["NUM_12_18_1"] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.feedEntry).toBe(true);
    expect(mocks.insertMock).toHaveBeenCalled();
    expect(openai.chat.completions.create).toHaveBeenCalled();
    expect(mocks.updateMock).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = r.data as any;
    expect(data.title).toBe("Banana Breakfast Bonanza");
    expect(data.log_id).toBe("log-act-1");
  });

  it("surfaces error when child can't be resolved", async () => {
    const { ctx } = makeCtx([]);
    const r = await activitiesModule.execute(
      "plan_activity",
      { milestone_ids: ["x"] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/any children/);
  });

  it("returns error for unknown tool", async () => {
    const { ctx } = makeCtx();
    const r = await activitiesModule.execute("nope", {}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown tool/);
  });
});
