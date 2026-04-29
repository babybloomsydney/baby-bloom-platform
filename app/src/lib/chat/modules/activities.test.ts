import { describe, it, expect, beforeEach, vi } from "vitest";
import { activitiesModule, applyPlanActivity } from "./activities";
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
  return { ctx, mocks: { milestoneSelect, insertMock } };
}

// ── Propose path ──────────────────────────────────────────────────────────
//
// WU 8.22d: plan_activity runs OpenAI generation INLINE at propose
// time so the user sees the actual plan in the draft preview, but
// does NOT insert into bapp_logs. The generation result rides in
// args._generated for apply to consume without re-calling OpenAI.

describe("activities module — plan_activity (propose)", () => {
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

  it("calls OpenAI but does NOT insert; returns draft tile with generated plan", async () => {
    const { ctx, mocks } = makeCtx();
    const r = await activitiesModule.execute(
      "plan_activity",
      { milestone_ids: ["NUM_12_18_1"] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(openai.chat.completions.create).toHaveBeenCalled();
    expect(mocks.insertMock).not.toHaveBeenCalled();
    expect(r.tile?.kind).toBe("draft");
    if (r.tile?.kind === "draft") {
      expect(r.tile.data.toolName).toBe("plan_activity");
      const preview = r.tile.data.preview;
      if (preview.kind === "activity") {
        expect(preview.data.item.status).toBe("ready");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((preview.data.item.data as any).title).toBe(
          "Banana Breakfast Bonanza",
        );
      } else {
        throw new Error(`expected activity preview, got ${preview.kind}`);
      }
      // The generated payload rides on args so apply can insert
      // without re-calling OpenAI.
      const args = r.tile.data.args as Record<string, unknown>;
      expect(args._generated).toBeDefined();
    }
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

// ── Apply path ────────────────────────────────────────────────────────────

describe("activities apply — plan_activity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts using the propose-time generated plan; does NOT re-call OpenAI", async () => {
    const { ctx, mocks } = makeCtx();
    // Simulate apply receiving the args that propose returned —
    // including the _generated.activityData payload.
    const argsFromPropose = {
      milestone_ids: ["NUM_12_18_1"],
      _generated: {
        activityData: {
          milestone_ids: ["NUM_12_18_1"],
          prompt_context: [
            {
              domain: "NUM",
              age: "12-18 months",
              desc: "Recognises 1-3 quantities",
            },
          ],
          activity_json: {
            creativeName: "Banana Breakfast Bonanza",
            description: "x",
            steps: [],
            milestone_domains: ["NUM"],
          },
          title: "Banana Breakfast Bonanza",
          image_url: null,
        },
      },
    };
    const r = await applyPlanActivity(argsFromPropose, {
      userId: ctx.userId,
      children: ctx.children,
      supabase: ctx.supabase,
    });
    expect(r.ok).toBe(true);
    expect(mocks.insertMock).toHaveBeenCalled();
    // Apply must not pay for a fresh OpenAI call when args carry
    // the generated plan from propose.
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    if (r.ok) {
      expect(r.tile.kind).toBe("activity");
      expect(r.data.title).toBe("Banana Breakfast Bonanza");
    }
  });

  it("falls back to re-generation when args are missing the propose payload", async () => {
    const { ctx } = makeCtx();
    // Direct apply with bare args (e.g., after a deep amend cycle).
    const r = await applyPlanActivity(
      { milestone_ids: ["NUM_12_18_1"] },
      { userId: ctx.userId, children: ctx.children, supabase: ctx.supabase },
    );
    expect(r.ok).toBe(true);
    expect(openai.chat.completions.create).toHaveBeenCalled();
  });
});
