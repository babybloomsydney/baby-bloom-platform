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

export const progressModule: BloomBotModule = {
  id: "progress",
  name: "Child Progress",
  description:
    "Reads EYLF milestones for a child's age bracket along with their observed scores and per-domain completion percent.",

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
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_milestones") return readMilestones(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `read_milestones` to see which EYLF milestones are on-plan for a child's age bracket and which have already been observed (observed_score > 0). Pair with `read_recent_feed` for the observation evidence.",
};
