/**
 * `diary` module — logs daily-care entries (meals, sleep).
 *
 * Writes to bapp_logs with type='diary', context='adhoc'. Shape of
 * `data` JSONB is tool-specific but self-describing so the existing
 * feed/timeline UIs render them without any changes.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof MEAL_TYPES)[number];

const MAX_SLEEP_MINUTES = 24 * 60; // a single nap can't exceed 24h

interface BappLogInsert {
  child_client_id: string;
  author_id: string;
  type: "diary";
  status: "completed";
  context: "adhoc";
  data: Record<string, unknown>;
}

async function insertLog(
  ctx: Parameters<BloomBotModule["execute"]>[2],
  row: BappLogInsert,
): Promise<{ id: string } | null> {
  const { data, error } = await ctx.supabase
    .from("bapp_logs")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return null;
  return data as { id: string };
}

// ── Shape mappers ──────────────────────────────────────────────────────────
// Canonical JSONB shapes the existing main-page DiaryTile renders:
//   food:  { subtype: "meal"|"snack"|"bottle", details|null, quantity|null,
//            time, title: "Food Log", image_url|null }
//   sleep: { subtype: "sleep", start, end, duration|null, notes|null,
//            title: "Sleep Log", image_url|null }
// (See src/types/bapp.ts FoodData + SleepData, and DiarySheet's submit
// payload which is the reference writer.)
// Previous implementation wrote a custom shape (entry_type / meal_type /
// items[] / duration_minutes) that DiaryTile didn't understand, so
// Katie-written diary rows silently failed to render in the main feed.
// This rewrite aligns on the canonical shape so the same row renders
// identically in both surfaces.

function mealTypeToFoodSubtype(mealType: string): "meal" | "snack" {
  return mealType === "snack" ? "snack" : "meal";
}

function humanDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function logFood(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const mealType = args.meal_type;
  if (
    typeof mealType !== "string" ||
    !MEAL_TYPES.includes(mealType as MealType)
  ) {
    return {
      success: false,
      error: `Invalid meal_type — expected one of ${MEAL_TYPES.join(", ")}.`,
    };
  }

  const items = Array.isArray(args.items) ? args.items.filter(Boolean) : [];
  if (items.length === 0) {
    return {
      success: false,
      error: "log_food needs at least one item (e.g. ['banana','yogurt']).",
    };
  }

  const rawTime =
    typeof args.time === "string" && args.time.trim().length > 0
      ? args.time.trim()
      : "";
  const rawNotes =
    typeof args.notes === "string" && args.notes.trim().length > 0
      ? args.notes.trim()
      : null;
  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  // Meal intent (breakfast/lunch/dinner/snack) is part of the details
  // line so it's not lost when the canonical shape only carries
  // meal|snack|bottle in `subtype`.
  const detailsLine = [`${mealType}: ${items.join(", ")}`, rawNotes]
    .filter(Boolean)
    .join(" — ");

  const foodData: Record<string, unknown> = {
    subtype: mealTypeToFoodSubtype(mealType),
    details: detailsLine,
    quantity: null,
    time: rawTime,
    title: "Food Log",
    image_url: imageUrl,
  };

  const inserted = await insertLog(ctx, {
    child_client_id: child.id,
    author_id: ctx.userId,
    type: "diary",
    status: "completed",
    context: "adhoc",
    data: foodData,
  });
  if (!inserted) {
    return { success: false, error: "Failed to log food entry." };
  }

  const nowIso = new Date().toISOString();
  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: inserted.id,
      child_name: child.firstName,
      meal_type: mealType,
      items,
    },
    tile: {
      kind: "diary",
      data: {
        item: {
          id: inserted.id,
          child_client_id: child.id,
          author_id: ctx.userId,
          author_name: "Katie",
          type: "diary",
          status: "completed",
          context: "adhoc",
          parent_log_id: null,
          data: foodData,
          created_at: nowIso,
          updated_at: nowIso,
        },
      },
    },
  };
}

async function logSleep(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const duration =
    typeof args.duration_minutes === "number"
      ? Math.round(args.duration_minutes)
      : NaN;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_SLEEP_MINUTES
  ) {
    return {
      success: false,
      error: `Invalid duration_minutes — must be a number between 1 and ${MAX_SLEEP_MINUTES}.`,
    };
  }

  const start =
    typeof args.start_time === "string" && args.start_time.trim().length > 0
      ? args.start_time.trim()
      : "";
  const end =
    typeof args.end_time === "string" && args.end_time.trim().length > 0
      ? args.end_time.trim()
      : "";
  const notesText =
    typeof args.notes === "string" && args.notes.trim().length > 0
      ? args.notes.trim()
      : null;
  const location =
    typeof args.location === "string" && args.location.trim().length > 0
      ? args.location.trim()
      : null;
  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  // Location + user notes combine into the canonical `notes` slot — no
  // separate field in SleepData.
  const combinedNotes = [notesText, location ? `at ${location}` : null]
    .filter(Boolean)
    .join(" · ");

  const sleepData: Record<string, unknown> = {
    subtype: "sleep",
    start,
    end,
    duration: humanDuration(duration),
    notes: combinedNotes.length > 0 ? combinedNotes : null,
    title: "Sleep Log",
    image_url: imageUrl,
  };

  const inserted = await insertLog(ctx, {
    child_client_id: child.id,
    author_id: ctx.userId,
    type: "diary",
    status: "completed",
    context: "adhoc",
    data: sleepData,
  });
  if (!inserted) {
    return { success: false, error: "Failed to log sleep entry." };
  }

  const nowIso = new Date().toISOString();
  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: inserted.id,
      child_name: child.firstName,
      duration_minutes: duration,
    },
    tile: {
      kind: "diary",
      data: {
        item: {
          id: inserted.id,
          child_client_id: child.id,
          author_id: ctx.userId,
          author_name: "Katie",
          type: "diary",
          status: "completed",
          context: "adhoc",
          parent_log_id: null,
          data: sleepData,
          created_at: nowIso,
          updated_at: nowIso,
        },
      },
    },
  };
}

export const diaryModule: BloomBotModule = {
  id: "diary",
  name: "Daily Diary",
  description:
    "Logs daily-care diary entries — meals (log_food) and sleep (log_sleep). Each entry produces a bapp_logs row visible in the child's feed.",

  tools: [
    {
      name: "log_food",
      description:
        "Log a meal or snack the child has eaten. Prefer this when the user describes any food consumed (breakfast, lunch, dinner, snack).",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
            description: "Type of meal.",
          },
          items: {
            type: "array",
            items: { type: "string" },
            description:
              "Individual food items eaten (e.g. ['banana', 'yogurt']).",
            minItems: 1,
          },
          time: {
            type: "string",
            description:
              "Optional clock time, free-form (e.g. '8am', '13:15').",
          },
          notes: {
            type: "string",
            description:
              "Optional notes (e.g. 'wouldn't eat the yogurt', 'new food').",
          },
        },
        required: ["meal_type", "items"],
      },
    },
    {
      name: "log_sleep",
      description:
        "Log a nap or sleep session. Prefer this when the user describes the child sleeping.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one).",
          },
          duration_minutes: {
            type: "number",
            description: "How long they slept, in minutes (1–1440).",
          },
          start_time: {
            type: "string",
            description:
              "Optional start clock-time, free-form (e.g. '12:30pm').",
          },
          end_time: {
            type: "string",
            description: "Optional end clock-time, free-form (e.g. '2:00pm').",
          },
          location: {
            type: "string",
            description:
              "Optional — where they slept (cot, pram, car, bed, etc.).",
          },
          notes: {
            type: "string",
            description: "Optional notes.",
          },
        },
        required: ["duration_minutes"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "log_food") return logFood(args, ctx);
    if (toolName === "log_sleep") return logSleep(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Log meals with `log_food` and sleep with `log_sleep`. Each call appends a diary entry to the child's feed. Confirm what you logged back to the user in natural language afterwards.",
};
