/**
 * `progress` module — reads EYLF milestones + a child's observed scores.
 *
 * Phase 2A read module. One tool: read_milestones.
 *
 * The 210 milestones live in `bapp_milestones` (7 domains × 6 age brackets
 * × 5 per bracket). A child's scores live in `bapp_progress_scores`
 * (`scores` JSONB keyed by milestone id, `percent` per domain).
 *
 * Returned shape is intentionally compact so Gemini can reason across
 * domains without drowning in rows. Unobserved milestones carry
 * observed_score = 0.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";
import { recalculateProgress } from "@/lib/actions/bapp/progress";

interface MilestoneRow {
  id: string;
  domain: string;
  age_bracket: string;
  description: string;
  sort_order: number | null;
}

interface ProgressScoreRow {
  domain: string;
  percent: number;
  scores: Record<string, number> | null;
  updated_at: string | null;
}

async function readMilestones(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const ageBracket =
    typeof args.age_bracket === "string" && args.age_bracket.trim().length > 0
      ? args.age_bracket
      : child.ageBracket;

  // 1. Load milestones for the bracket (public read — active only).
  const { data: milestones, error: mError } = await ctx.supabase
    .from("bapp_milestones")
    .select("id, domain, age_bracket, description, sort_order")
    .eq("age_bracket", ageBracket)
    .eq("is_active", true)
    .order("domain");

  if (mError) {
    return {
      success: false,
      error: `Failed to read milestones: ${mError.message}`,
    };
  }

  // 2. Load this child's progress scores across all domains.
  const { data: scores, error: sError } = await ctx.supabase
    .from("bapp_progress_scores")
    .select("domain, percent, scores, updated_at")
    .eq("child_client_id", child.id);

  if (sError) {
    return {
      success: false,
      error: `Failed to read progress scores: ${sError.message}`,
    };
  }

  const scoreRows = (scores ?? []) as ProgressScoreRow[];

  // Flatten scores JSONB → id → score map for quick lookup.
  const observed = new Map<string, number>();
  for (const row of scoreRows) {
    if (!row.scores) continue;
    for (const [milestoneId, score] of Object.entries(row.scores)) {
      if (typeof score === "number") observed.set(milestoneId, score);
    }
  }

  // Per-domain summary.
  const domainSummary: Record<
    string,
    { percent: number; updated_at: string | null }
  > = {};
  for (const row of scoreRows) {
    domainSummary[row.domain] = {
      percent: Number(row.percent ?? 0),
      updated_at: row.updated_at,
    };
  }

  // Shape milestones for response.
  const shaped = ((milestones as MilestoneRow[] | null) ?? []).map((m) => ({
    id: m.id,
    domain: m.domain,
    age_bracket: m.age_bracket,
    description: m.description,
    sort_order: m.sort_order ?? 0,
    observed_score: observed.get(m.id) ?? 0,
  }));

  return {
    success: true,
    data: {
      child_name: child.firstName,
      age_bracket: ageBracket,
      total: shaped.length,
      milestones: shaped,
      domain_summary: domainSummary,
    },
  };
}

interface MilestoneUpdateInput {
  milestone_id: unknown;
  score: unknown;
}

async function updateProgress(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const raw = args.updates;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      success: false,
      error: "Pass at least one milestone update in the `updates` array.",
    };
  }

  const cleaned: Array<{ id: string; score: number }> = [];
  for (const u of raw as MilestoneUpdateInput[]) {
    const id = typeof u?.milestone_id === "string" ? u.milestone_id : null;
    const score = typeof u?.score === "number" ? Math.round(u.score) : NaN;
    if (!id || !Number.isFinite(score) || score < 1 || score > 4) {
      return {
        success: false,
        error: `Invalid update ${JSON.stringify(u)} — each update needs a milestone_id and a score between 1 and 4.`,
      };
    }
    cleaned.push({ id, score });
  }

  try {
    await recalculateProgress(child.id, cleaned);
  } catch (err) {
    return {
      success: false,
      error: `Failed to update progress: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    success: true,
    feedEntry: false,
    data: {
      child_name: child.firstName,
      updated_count: cleaned.length,
      updates: cleaned,
    },
  };
}

export const progressModule: BloomBotModule = {
  id: "progress",
  name: "Child Progress",
  description:
    "Reads EYLF milestones for a child's age bracket along with their observed scores and per-domain completion percent, and applies direct progress updates.",

  tools: [
    {
      name: "read_milestones",
      description:
        "Read the 35 EYLF milestones for a child's age bracket (7 domains × 5) alongside their current observed scores and per-domain completion percent. Use before suggesting activities so you know what's already been observed and which domains lag.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          age_bracket: {
            type: "string",
            enum: [
              "0-3 months",
              "3-6 months",
              "6-12 months",
              "12-18 months",
              "18-24 months",
              "24-32 months",
            ],
            description:
              "Override the child's current age bracket (optional). Defaults to the child's own bracket.",
          },
        },
        required: [],
      },
    },
    {
      name: "update_progress",
      description:
        "Directly set a child's observed scores against specific milestones. Scores go up only (recalculateProgress takes max with existing). Use this for bulk corrections or quick updates; for single observations prefer log_observation via the observations module so the evidence is captured.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          updates: {
            type: "array",
            description:
              "Milestone updates to apply. Each item is { milestone_id, score } where score is 1–4.",
            items: {
              type: "object",
              properties: {
                milestone_id: {
                  type: "string",
                  description:
                    "Milestone id from bapp_milestones (e.g. `CL_12_18_1`).",
                },
                score: {
                  type: "number",
                  description: "Observed score, integer 1-4.",
                },
              },
              required: ["milestone_id", "score"],
            },
            minItems: 1,
          },
        },
        required: ["updates"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_milestones") return readMilestones(args, ctx);
    if (toolName === "update_progress") return updateProgress(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `read_milestones` to see which EYLF milestones are on-plan for a child's age bracket and which have already been observed (observed_score > 0). Pair with `read_recent_feed` for the observation evidence. Use `update_progress` only for bulk or direct corrections — logging an observation via the observations module is preferred when the user is describing something they saw.",
};
