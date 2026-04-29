/**
 * `activities` module — generates activity plans tied to milestones.
 *
 * Two-turn (WU 8.22d):
 *   - propose_X (LLM-callable `plan_activity`): validates args,
 *     loads milestone context, runs OpenAI inline, returns a
 *     `kind: "draft"` tile carrying the GENERATED plan in args.
 *     No DB writes. The user sees the actual plan in the draft
 *     preview before deciding to Accept.
 *   - apply (`applyPlanActivity`, called by /api/chat/drafts/accept):
 *     takes the propose-output args (which already include the
 *     generated plan) and INSERTS a bapp_logs row with
 *     status='ready'. No re-generation — the plan is already in
 *     args, so Accept is cheap.
 *
 * Trade-off: generation runs at propose time (so the user sees the
 * actual plan before accepting). A Dismiss therefore wastes the
 * generation cost. Amend cycles are user-initiated and re-run
 * propose with revised milestone_ids; the cost is bounded.
 */

import type { BloomBotModule, ToolResult, ChildSummary } from "./types";
import type { ActivityChatTile } from "@/lib/chat/tiles";
import type { SupabaseClient } from "@supabase/supabase-js";
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

interface PromptContextEntry {
  domain: string;
  age: string;
  desc: string;
}

interface PreparedActivity {
  child: ChildSummary;
  milestoneIds: string[];
  promptContext: PromptContextEntry[];
}

async function prepareActivity(
  args: Record<string, unknown>,
  ctx: { children: ChildSummary[]; supabase: SupabaseClient },
): Promise<
  | { ok: true; prepared: PreparedActivity }
  | { ok: false; error: string; terminal?: boolean }
> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) {
    return {
      ok: false,
      error: r.error.error ?? "Could not resolve child.",
      terminal: r.error.terminal,
    };
  }
  const child = r.child;

  const milestoneIds = Array.isArray(args.milestone_ids)
    ? (args.milestone_ids.filter(
        (m) => typeof m === "string" && m.trim().length > 0,
      ) as string[])
    : [];
  if (milestoneIds.length === 0) {
    return {
      ok: false,
      error:
        "plan_activity needs a `milestone_ids` array. Call read_milestones first to pick the milestones to target.",
    };
  }

  const { data: milestones } = await ctx.supabase
    .from("bapp_milestones")
    .select("id, domain, age_bracket, description")
    .in("id", milestoneIds);

  const rows = ((milestones ?? []) as MilestoneContextRow[]).filter(Boolean);
  if (rows.length === 0) {
    return {
      ok: false,
      error: `No milestones found for ids: ${milestoneIds.join(", ")}`,
    };
  }
  const promptContext: PromptContextEntry[] = rows.map((m) => ({
    domain: m.domain,
    age: m.age_bracket,
    desc: m.description,
  }));

  return {
    ok: true,
    prepared: { child, milestoneIds, promptContext },
  };
}

async function generateActivityPlan(
  child: ChildSummary,
  promptContext: PromptContextEntry[],
): Promise<{ ok: true; plan: ActivityPlan } | { ok: false; error: string }> {
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
    const plan = JSON.parse(content) as ActivityPlan;
    return { ok: true, plan };
  } catch (err) {
    return {
      ok: false,
      error: `Activity generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function buildActivityTile(
  logId: string,
  childId: string,
  authorId: string,
  data: Record<string, unknown>,
  createdAtIso: string,
): ActivityChatTile {
  return {
    kind: "activity",
    data: {
      item: {
        id: logId,
        child_client_id: childId,
        author_id: authorId,
        author_name: "Katie",
        type: "activity",
        status: "ready",
        context: "adhoc",
        parent_log_id: null,
        data,
        created_at: createdAtIso,
        updated_at: createdAtIso,
      },
    },
  };
}

// ── Propose path (LLM-callable) ──────────────────────────────────────────

async function proposePlanActivity(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = await prepareActivity(args, {
    children: ctx.children,
    supabase: ctx.supabase,
  });
  if (!r.ok) {
    return { success: false, error: r.error, terminal: r.terminal };
  }
  const { child, milestoneIds, promptContext } = r.prepared;

  // Run generation NOW so the user sees the actual plan in the
  // draft preview. Apply just inserts the already-generated plan.
  const gen = await generateActivityPlan(child, promptContext);
  if (!gen.ok) {
    return { success: false, error: gen.error };
  }
  const plan = gen.plan;

  const title = plan?.creativeName ?? "Activity Plan";
  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  const activityData = {
    milestone_ids: milestoneIds,
    prompt_context: promptContext,
    activity_json: plan,
    title,
    image_url: imageUrl,
  };

  // Re-pack args with the generated plan so applyPlanActivity can
  // insert without re-calling OpenAI. The plan + prompt_context
  // ride along; a future amend cycle replaces them by re-running
  // propose with new milestone_ids.
  const argsWithPlan = {
    ...args,
    _generated: { activityData },
  };

  const draftId = `draft_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  return {
    success: true,
    data: {
      draft_id: draftId,
      child_name: child.firstName,
      title,
      milestone_ids: milestoneIds,
      plan,
    },
    tile: {
      kind: "draft",
      data: {
        draftId,
        toolName: "plan_activity",
        args: argsWithPlan,
        preview: buildActivityTile(
          draftId,
          child.id,
          ctx.userId,
          activityData,
          nowIso,
        ),
      },
    },
  };
}

// ── Apply path (frontend-callable via /api/chat/drafts/accept) ───────────

export interface ActivityApplyResult {
  ok: true;
  tile: ActivityChatTile;
  data: { log_id: string; child_name: string; title: string };
}

export interface ActivityApplyError {
  ok: false;
  error: string;
}

export async function applyPlanActivity(
  args: Record<string, unknown>,
  ctx: { userId: string; children: ChildSummary[]; supabase: SupabaseClient },
): Promise<ActivityApplyResult | ActivityApplyError> {
  const r = await prepareActivity(args, {
    children: ctx.children,
    supabase: ctx.supabase,
  });
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const { child } = r.prepared;

  // Apply uses the generation produced at propose-time. If the
  // chat client somehow strips `_generated`, falls through to a
  // re-generation so we don't insert an empty plan.
  //
  // Consistency check: a prior amend cycle could have changed
  // `milestone_ids` in args without re-running propose, leaving
  // `_generated.activityData` keyed against an older milestone set.
  // If the IDs don't match, regenerate rather than persisting a
  // plan that doesn't reflect the user's current intent.
  let activityData: Record<string, unknown>;
  const generated = (
    args as { _generated?: { activityData?: Record<string, unknown> } }
  )._generated?.activityData;
  const isPlainObject =
    generated && typeof generated === "object" && !Array.isArray(generated);
  let useGenerated = false;
  if (isPlainObject) {
    const generatedIds = Array.isArray(
      (generated as { milestone_ids?: unknown }).milestone_ids,
    )
      ? (
          (generated as { milestone_ids?: unknown[] }).milestone_ids ?? []
        ).filter((v): v is string => typeof v === "string")
      : [];
    const currentIds = r.prepared.milestoneIds;
    const setsMatch =
      generatedIds.length === currentIds.length &&
      currentIds.every((id) => generatedIds.includes(id));
    if (setsMatch) {
      useGenerated = true;
    }
  }
  if (useGenerated) {
    activityData = { ...(generated as Record<string, unknown>) };
  } else {
    const gen = await generateActivityPlan(
      r.prepared.child,
      r.prepared.promptContext,
    );
    if (!gen.ok) return { ok: false, error: gen.error };
    activityData = {
      milestone_ids: r.prepared.milestoneIds,
      prompt_context: r.prepared.promptContext,
      activity_json: gen.plan,
      title: gen.plan?.creativeName ?? "Activity Plan",
      image_url: null,
    };
  }

  // Image_url may have been added on the draft tile post-propose.
  if (typeof args.image_url === "string" && args.image_url.trim().length > 0) {
    activityData = { ...activityData, image_url: args.image_url.trim() };
  } else if (args.image_url === null) {
    activityData = { ...activityData, image_url: null };
  }

  const { data: inserted, error: insertErr } = await ctx.supabase
    .from("bapp_logs")
    .insert({
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "activity",
      status: "ready",
      context: "adhoc",
      data: activityData,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return {
      ok: false,
      error: `Failed to write activity log: ${insertErr?.message ?? "unknown"}`,
    };
  }
  const logId = (inserted as { id: string }).id;

  const title =
    typeof activityData.title === "string"
      ? activityData.title
      : "Activity Plan";
  const nowIso = new Date().toISOString();
  return {
    ok: true,
    data: { log_id: logId, child_name: child.firstName, title },
    tile: buildActivityTile(logId, child.id, ctx.userId, activityData, nowIso),
  };
}

// ── Module export ────────────────────────────────────────────────────────

export const activitiesModule: BloomBotModule = {
  id: "activities",
  name: "Activities",
  description:
    "Drafts activity plans targeting specific milestones. Generation runs at propose time so the user sees the plan before accepting; Accept inserts the bapp_logs row.",

  tools: [
    {
      name: "plan_activity",
      description:
        "Draft an age-appropriate activity plan for the child targeting one or more specific milestones. Returns a draft tile carrying the GENERATED plan. The user must Accept to write it to the feed. Call read_milestones first — milestones already at high scores are poor targets.",
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
          image_url: {
            type: "string",
            description: "Optional image URL if the user attached a photo.",
          },
        },
        required: ["milestone_ids"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "plan_activity") return proposePlanActivity(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `plan_activity` to draft an activity plan for the child. Always call `read_milestones` first so you pick LOW-scored milestones (observed_score < 3). The tool returns a DRAFT tile — say something like 'Drafted: <creativeName>. Review and accept.' and stop. The plan is already generated when you see the draft; the user's Accept commits it.",
};
