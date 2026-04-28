/**
 * `activities` module — generates activity plans tied to milestones.
 *
 * Awaits OpenAI inline so Katie can describe the plan in the same
 * conversational turn. That's a deliberate trade — a few extra
 * seconds on the tool round in exchange for the assistant being
 * able to speak naturally about what was just planned.
 *
 * The existing `generateActivity` server action uses a background-
 * completion pattern (pending log → polling UI). Katie mirrors the
 * DB shape so the resulting bapp_logs row renders in existing feeds
 * unchanged, but waits for the generation synchronously.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";
import { openai } from "@/lib/ai/client";
import {
  ACTIVITY_SYSTEM_PROMPT,
  buildActivityUserPrompt,
} from "@/lib/ai/prompts/bapp-activity-generation";
import type { ActivityPlan } from "@/types/bapp";

interface MilestoneContextRow {
  id: string;
  domain: string;
  age_bracket: string;
  description: string;
}

async function planActivity(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const milestoneIds = Array.isArray(args.milestone_ids)
    ? (args.milestone_ids.filter(
        (m) => typeof m === "string" && m.trim().length > 0,
      ) as string[])
    : [];
  if (milestoneIds.length === 0) {
    return {
      success: false,
      error:
        "plan_activity needs a `milestone_ids` array. Call read_milestones first to pick the milestones to target.",
    };
  }

  // 1. Load milestone context for the prompt.
  const { data: milestones } = await ctx.supabase
    .from("bapp_milestones")
    .select("id, domain, age_bracket, description")
    .in("id", milestoneIds);

  const rows = ((milestones ?? []) as MilestoneContextRow[]).filter(Boolean);
  if (rows.length === 0) {
    return {
      success: false,
      error: `No milestones found for ids: ${milestoneIds.join(", ")}`,
    };
  }
  const promptContext = rows.map((m) => ({
    domain: m.domain,
    age: m.age_bracket,
    desc: m.description,
  }));

  // 2. Insert the pending log so the feed immediately shows something.
  const { data: inserted, error: insertErr } = await ctx.supabase
    .from("bapp_logs")
    .insert({
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "activity",
      status: "pending",
      context: "adhoc",
      data: {
        milestone_ids: milestoneIds,
        prompt_context: promptContext,
        activity_json: null,
        title: "Generating Plan...",
      },
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return {
      success: false,
      error: `Failed to create activity log: ${insertErr?.message ?? "unknown"}`,
    };
  }
  const logId = (inserted as { id: string }).id;

  // 3. Run OpenAI inline so the tool call carries the plan back to Katie.
  let plan: ActivityPlan | null = null;
  try {
    const userPrompt = buildActivityUserPrompt(
      child.firstName,
      child.ageMonths,
      promptContext,
    );
    const resp = await openai.chat.completions.create({
      model: "gpt-5.4-nano",
      messages: [
        { role: "system", content: ACTIVITY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");
    plan = JSON.parse(content) as ActivityPlan;
  } catch (err) {
    // Leave the pending row — the existing UI polls and a retry will pick it up.
    return {
      success: false,
      error: `Activity logged as pending but generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Fill in the log row with the generated plan.
  const title = plan?.creativeName ?? "Activity Plan";
  const activityData = {
    milestone_ids: milestoneIds,
    prompt_context: promptContext,
    activity_json: plan,
    title,
  };
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await ctx.supabase
    .from("bapp_logs")
    .update({
      status: "ready",
      data: activityData,
    })
    .eq("id", logId);
  if (updateErr) {
    // The plan was generated but we couldn't promote the row from
    // 'pending' to 'ready'. Best-effort: flip the row to 'error' so
    // the feed stops rendering "Generating Plan…" forever. If even
    // that recovery fails, log it and continue — the user gets the
    // chat error either way.
    void ctx.supabase
      .from("bapp_logs")
      .update({ status: "error" })
      .eq("id", logId)
      .then(({ error: recoveryErr }) => {
        if (recoveryErr) {
          console.error(
            "[activities] recovery flip to status=error also failed",
            { logId, recoveryErr },
          );
        }
      });
    return {
      success: false,
      error: `Activity generated but log update failed: ${updateErr.message}`,
    };
  }

  // 5. Emit the same ActivityTile the child feed uses. FeedItem-shaped
  //    snapshot is fine here — bapp_logs of type='activity' are
  //    effectively append-only after ready, so the tile stays correct
  //    on scroll-back without a re-fetch.
  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: logId,
      child_name: child.firstName,
      title,
      milestone_ids: milestoneIds,
      plan,
    },
    tile: {
      kind: "activity",
      data: {
        item: {
          id: logId,
          child_client_id: child.id,
          author_id: ctx.userId,
          // Katie-authored — "Katie" as the byline matches the sparkle
          // vibe the tile already leans into when rendered in chat.
          author_name: "Katie",
          type: "activity",
          status: "ready",
          context: "adhoc",
          parent_log_id: null,
          data: activityData,
          created_at: nowIso,
          updated_at: nowIso,
        },
      },
    },
  };
}

export const activitiesModule: BloomBotModule = {
  id: "activities",
  name: "Activities",
  description:
    "Generates activity plans targeting specific milestones. Writes a bapp_logs row (type='activity') with the generated plan.",

  tools: [
    {
      name: "plan_activity",
      description:
        "Generate an age-appropriate activity plan for the child targeting one or more specific milestones. Call read_milestones first to pick relevant targets — milestones already at high scores are poor choices.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          milestone_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Milestone ids from bapp_milestones (e.g. ['NUM_12_18_1','CL_12_18_2']). At least one required.",
            minItems: 1,
          },
        },
        required: ["milestone_ids"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "plan_activity") return planActivity(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `plan_activity` to generate an activity plan for the child. Always call `read_milestones` first so you pick milestones that are LOW-scored (observed_score < 3) — there's no point generating an activity for something already mastered. After plan_activity succeeds, describe the plan's creativeName + one line of what it does back to the user.",
};
