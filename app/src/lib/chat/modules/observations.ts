/**
 * `observations` module — captures observations and cascades into progress.
 *
 * Mirrors the core of logObservation() without the cookie-auth + insight-
 * generation + revalidatePath side-effects, which don't suit a streaming
 * tool handler. Insight generation stays with the server action for the
 * interactive UI; here the tool call is synchronous and blocks only on
 * the DB writes.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";
import {
  recalculateProgress,
  writeHistorySnapshot,
} from "@/lib/actions/bapp/progress";

const OBSERVATION_DOMAINS = [
  "General",
  "CL",
  "EAD",
  "LIT",
  "NUM",
  "PD",
  "PSE",
  "UW",
] as const;

async function logObservation(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const note = typeof args.note === "string" ? args.note.trim() : "";
  if (note.length === 0) {
    return {
      success: false,
      error: "log_observation needs a `note` describing what was observed.",
    };
  }

  const domainArg =
    typeof args.domain === "string" && args.domain.trim().length > 0
      ? args.domain.trim()
      : "General";
  const domain = (OBSERVATION_DOMAINS as readonly string[]).includes(domainArg)
    ? domainArg
    : "General";

  const milestoneId =
    typeof args.milestone_id === "string" && args.milestone_id.trim().length > 0
      ? args.milestone_id.trim()
      : null;

  let score: number | null = null;
  if (args.score !== undefined && args.score !== null) {
    const raw = typeof args.score === "number" ? Math.round(args.score) : NaN;
    if (!Number.isFinite(raw) || raw < 1 || raw > 4) {
      return {
        success: false,
        error: "score must be a number between 1 and 4.",
      };
    }
    score = raw;
  }

  const title =
    typeof args.title === "string" && args.title.trim().length > 0
      ? args.title.trim()
      : note.slice(0, 60);

  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  const { data: inserted, error: insertError } = await ctx.supabase
    .from("bapp_logs")
    .insert({
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "observation",
      status: "completed",
      context: "adhoc",
      data: {
        title,
        domain,
        milestone_id: milestoneId,
        score,
        note,
        image_url: imageUrl,
      },
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      success: false,
      error: `Failed to log observation: ${insertError?.message ?? "unknown"}`,
    };
  }

  const logId = (inserted as { id: string }).id;

  // Cascade into progress when the observation names a milestone + score.
  if (milestoneId && score) {
    try {
      await recalculateProgress(child.id, [{ id: milestoneId, score }]);
      await writeHistorySnapshot(child.id, logId);
    } catch (err) {
      return {
        success: false,
        error: `Logged observation but progress recalculation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: logId,
      child_name: child.firstName,
      domain,
      milestone_id: milestoneId,
      score,
      progress_updated: Boolean(milestoneId && score),
    },
  };
}

export const observationsModule: BloomBotModule = {
  id: "observations",
  name: "Observations",
  description:
    "Captures observations about a child. Passing a milestone_id + score (1-4) cascades into a progress recalculation and a history snapshot.",

  tools: [
    {
      name: "log_observation",
      description:
        "Record an observation about a child — what the user saw them do, a moment worth capturing, or a milestone attempt. If the note is evidence of a specific milestone, pass milestone_id + score (1-4) to also update progress.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          note: {
            type: "string",
            description:
              "What you observed, in the user's voice. Required. Try to preserve the phrasing they gave you.",
          },
          title: {
            type: "string",
            description: "Short headline for the entry. Optional.",
          },
          domain: {
            type: "string",
            enum: ["General", "CL", "EAD", "LIT", "NUM", "PD", "PSE", "UW"],
            description:
              "EYLF domain (CL/EAD/LIT/NUM/PD/PSE/UW) or 'General' if the observation isn't tied to a specific domain. Defaults to General.",
          },
          milestone_id: {
            type: "string",
            description:
              "Optional — a milestone id from bapp_milestones (e.g. 'CL_12_18_1') if this observation is evidence of a specific milestone.",
          },
          score: {
            type: "number",
            description:
              "Optional — mastery score 1-4. Only meaningful when milestone_id is also set. Triggers progress recalculation.",
          },
          image_url: {
            type: "string",
            description: "Optional image URL if the user attached a photo.",
          },
        },
        required: ["note"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "log_observation") return logObservation(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `log_observation` whenever the user describes something they saw the child do. If the observation is clearly evidence of a specific milestone (ask yourself: does this match one of the bracket's milestones from read_milestones?) include `milestone_id` + `score` (1-4) so progress updates automatically. Otherwise leave them out — a general observation is still valuable.",
};
