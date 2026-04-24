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
import {
  recalculateProgress,
  writeHistorySnapshot,
} from "@/lib/actions/bapp/progress";

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

const DOMAIN_CODES = ["CL", "PSE", "PD", "LIT", "NUM", "UW", "EAD"] as const;
type DomainCode = (typeof DOMAIN_CODES)[number];

interface HistoryRow {
  id: string;
  created_at: string;
  cl_total: number | null;
  pse_total: number | null;
  pd_total: number | null;
  lit_total: number | null;
  num_total: number | null;
  uw_total: number | null;
  ead_total: number | null;
  ref_log_id: string | null;
}

function rowToTotals(row: HistoryRow): Record<DomainCode, number> {
  return {
    CL: row.cl_total ?? 0,
    PSE: row.pse_total ?? 0,
    PD: row.pd_total ?? 0,
    LIT: row.lit_total ?? 0,
    NUM: row.num_total ?? 0,
    UW: row.uw_total ?? 0,
    EAD: row.ead_total ?? 0,
  };
}

async function readProgressHistory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const from =
    typeof args.from === "string" && args.from.trim() ? args.from : null;
  const to = typeof args.to === "string" && args.to.trim() ? args.to : null;
  const limit = Math.min(
    200,
    Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 50),
  );

  let query = ctx.supabase
    .from("bapp_progress_history")
    .select(
      "id, created_at, cl_total, pse_total, pd_total, lit_total, num_total, uw_total, ead_total, ref_log_id",
    )
    .eq("child_client_id", child.id);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  query = query.order("created_at", { ascending: true }).limit(limit);

  const { data, error } = await query;
  if (error) {
    return {
      success: false,
      error: `Failed to read progress history: ${error.message}`,
    };
  }

  const rows = (data ?? []) as HistoryRow[];
  const empty: Record<DomainCode, number> = {
    CL: 0,
    PSE: 0,
    PD: 0,
    LIT: 0,
    NUM: 0,
    UW: 0,
    EAD: 0,
  };

  const snapshots = rows.map((row) => ({
    id: row.id,
    snapshot_at: row.created_at,
    ref_log_id: row.ref_log_id,
    totals: rowToTotals(row),
  }));

  let delta: Record<DomainCode, number> = { ...empty };
  if (rows.length >= 2) {
    const first = rowToTotals(rows[0]);
    const last = rowToTotals(rows[rows.length - 1]);
    delta = {
      CL: last.CL - first.CL,
      PSE: last.PSE - first.PSE,
      PD: last.PD - first.PD,
      LIT: last.LIT - first.LIT,
      NUM: last.NUM - first.NUM,
      UW: last.UW - first.UW,
      EAD: last.EAD - first.EAD,
    };
  }

  return {
    success: true,
    data: {
      child_name: child.firstName,
      window: { from, to, limit },
      count: snapshots.length,
      snapshots,
      delta,
      latest: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    },
  };
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

  const note =
    typeof args.note === "string" && args.note.trim().length > 0
      ? args.note.trim()
      : null;
  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  // Mirror logBulkProgress from the main-page wizard: write the
  // progress row first so the child's feed shows this update, then
  // recalc + snapshot. Shape matches ProgressData in src/types/bapp.ts
  // so the same row renders identically on the child's development
  // page.
  const progressData: Record<string, unknown> = {
    updates: cleaned,
    title: "Progress Update",
    image_url: imageUrl,
    note,
  };

  const { data: inserted, error: insertError } = await ctx.supabase
    .from("bapp_logs")
    .insert({
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "progress",
      status: "completed",
      context: "adhoc",
      data: progressData,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      success: false,
      error: `Failed to write progress row: ${insertError?.message ?? "unknown"}`,
    };
  }

  const logId = (inserted as { id: string }).id;

  try {
    await recalculateProgress(child.id, cleaned);
    await writeHistorySnapshot(child.id, logId);
  } catch (err) {
    return {
      success: false,
      error: `Wrote progress row but recalculation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const nowIso = new Date().toISOString();
  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: logId,
      child_name: child.firstName,
      updated_count: cleaned.length,
      updates: cleaned,
    },
    tile: {
      kind: "progress",
      data: {
        item: {
          id: logId,
          child_client_id: child.id,
          author_id: ctx.userId,
          author_name: "Katie",
          type: "progress",
          status: "completed",
          context: "adhoc",
          parent_log_id: null,
          data: progressData,
          created_at: nowIso,
          updated_at: nowIso,
        },
      },
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
      name: "read_progress_history",
      description:
        "Read a child's EYLF progress snapshots over time (bapp_progress_history). Each snapshot is a point-in-time sum of scored milestone points per domain — written whenever an observation is logged with a milestone + score. Use for trend questions ('how has progress changed this month?', 'which domain improved most?'). Returns snapshots + a computed delta (latest minus earliest in the window).",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          from: {
            type: "string",
            description:
              "Optional ISO 8601 datetime. Only return snapshots at or after this instant.",
          },
          to: {
            type: "string",
            description:
              "Optional ISO 8601 datetime. Only return snapshots at or before this instant.",
          },
          limit: {
            type: "number",
            description: "Max snapshots to return (default 50, capped at 200).",
          },
        },
        required: [],
      },
    },
    {
      name: "update_progress",
      description:
        "Directly set a child's observed scores against specific milestones. Scores go up only (recalculateProgress takes max with existing). Writes a progress entry to the child's feed so both the main development page and Katie's chat show the same update. Use this for bulk corrections or quick updates; for single observations prefer log_observation via the observations module so the evidence is captured.",
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
          note: {
            type: "string",
            description:
              "Optional note attached to the progress entry (e.g. 'catching up after a quiet week').",
          },
          image_url: {
            type: "string",
            description: "Optional image URL if the user attached a photo.",
          },
        },
        required: ["updates"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_milestones") return readMilestones(args, ctx);
    if (toolName === "read_progress_history")
      return readProgressHistory(args, ctx);
    if (toolName === "update_progress") return updateProgress(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `read_milestones` to see which EYLF milestones are on-plan for a child's age bracket and which have already been observed (observed_score > 0). Pair with `read_recent_feed` for the observation evidence. Use `read_progress_history` when the user asks about trends (last week, last month, 'how has X changed?') — it returns point-in-time domain-total snapshots plus a delta across the window. Use `update_progress` only for bulk or direct corrections — logging an observation via the observations module is preferred when the user is describing something they saw.",
};
