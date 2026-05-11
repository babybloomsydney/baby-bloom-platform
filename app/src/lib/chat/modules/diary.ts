/**
 * `diary` module — logs daily-care entries (meals, sleep).
 *
 * Writes to bapp_logs with type='diary', context='adhoc'. Shape of
 * `data` JSONB is tool-specific but self-describing so the existing
 * feed/timeline UIs render them without any changes.
 *
 * Two-turn pattern (WU 8.22c):
 *   1. The LLM-callable tool (`log_food`, `log_sleep`) is the
 *      *propose* path — it validates the args, builds the would-be
 *      bapp_log shape, and returns a `kind: "draft"` chat tile.
 *      Nothing is inserted at this stage.
 *   2. The user clicks Accept on the draft tile. The frontend POSTs
 *      to /api/chat/drafts/accept, which calls `applyLogFood` /
 *      `applyLogSleep` (exported below). Those functions actually
 *      INSERT into bapp_logs and return the persisted tile, which
 *      replaces the draft tile on the host chat message.
 *
 * `prepareFood` / `prepareSleep` are the shared validation +
 * shape-mapping helpers. Both propose and apply call them. If a
 * future amend cycle re-emits propose with revised args, the same
 * preparation runs again with the new inputs.
 */

import type { BloomBotModule, ToolResult, ChildSummary } from "./types";
import type { DiaryChatTile } from "@/lib/chat/tiles";
import type { SupabaseClient } from "@supabase/supabase-js";
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

interface InsertCtx {
  userId: string;
  supabase: SupabaseClient;
}

async function insertLog(
  ctx: InsertCtx,
  row: BappLogInsert,
): Promise<{ id: string } | null> {
  const { data, error } = await ctx.supabase
    .from("bapp_logs")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    // Log the underlying Supabase error so RLS / constraint /
    // network failures are diagnosable from server logs. The
    // caller surface only carries a generic "Failed to save…"
    // string to the user — without this log line the original
    // error code + message would be lost forever.
    console.error("[diary insertLog] bapp_logs insert failed:", error);
    return null;
  }
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

interface PreparedFood {
  child: ChildSummary;
  mealType: MealType;
  items: string[];
  foodData: Record<string, unknown>;
}

function prepareFood(
  args: Record<string, unknown>,
  children: ChildSummary[],
):
  | { ok: true; prepared: PreparedFood }
  | { ok: false; error: string; terminal?: boolean } {
  const r = resolveChild(args.child_name, children);
  if (r.error) {
    return {
      ok: false,
      error: r.error.error ?? "Could not resolve child.",
      terminal: r.error.terminal,
    };
  }
  const child = r.child;

  const mealType = args.meal_type;
  if (
    typeof mealType !== "string" ||
    !MEAL_TYPES.includes(mealType as MealType)
  ) {
    return {
      ok: false,
      error: `Invalid meal_type — expected one of ${MEAL_TYPES.join(", ")}.`,
    };
  }

  const items: string[] = Array.isArray(args.items)
    ? args.items.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      )
    : [];
  if (items.length === 0) {
    return {
      ok: false,
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

  return {
    ok: true,
    prepared: {
      child,
      mealType: mealType as MealType,
      items,
      foodData,
    },
  };
}

interface PreparedSleep {
  child: ChildSummary;
  durationMinutes: number;
  sleepData: Record<string, unknown>;
}

function prepareSleep(
  args: Record<string, unknown>,
  children: ChildSummary[],
):
  | { ok: true; prepared: PreparedSleep }
  | { ok: false; error: string; terminal?: boolean } {
  const r = resolveChild(args.child_name, children);
  if (r.error) {
    return {
      ok: false,
      error: r.error.error ?? "Could not resolve child.",
      terminal: r.error.terminal,
    };
  }
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
      ok: false,
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

  return {
    ok: true,
    prepared: { child, durationMinutes: duration, sleepData },
  };
}

interface PreparedUpdate {
  child: ChildSummary;
  updateData: Record<string, unknown>;
}

/** Free-form parent-update note. Sister of "General Observation"
 *  but lives under the Diary surface (renders with badge "Diary
 *  Entry"). Validation: trimmed note must be non-empty. */
function prepareUpdate(
  args: Record<string, unknown>,
  children: ChildSummary[],
):
  | { ok: true; prepared: PreparedUpdate }
  | { ok: false; error: string; terminal?: boolean } {
  const r = resolveChild(args.child_name, children);
  if (r.error) {
    return {
      ok: false,
      error: r.error.error ?? "Could not resolve child.",
      terminal: r.error.terminal,
    };
  }
  const child = r.child;

  const note = typeof args.note === "string" ? args.note.trim() : "";
  if (note.length === 0) {
    return {
      ok: false,
      error: "log_update needs a `note` describing the update.",
    };
  }

  const imageUrl =
    typeof args.image_url === "string" && args.image_url.trim().length > 0
      ? args.image_url.trim()
      : null;

  const updateData: Record<string, unknown> = {
    subtype: "update",
    note,
    title: "Diary Entry",
    image_url: imageUrl,
  };

  return { ok: true, prepared: { child, updateData } };
}

// ── Tile builders ─────────────────────────────────────────────────────────

function buildDiaryTile(
  logId: string,
  childId: string,
  authorId: string,
  data: Record<string, unknown>,
  createdAtIso: string,
): DiaryChatTile {
  return {
    kind: "diary",
    data: {
      item: {
        id: logId,
        child_client_id: childId,
        author_id: authorId,
        author_name: "Katie",
        type: "diary",
        status: "completed",
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

async function proposeLogFood(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = prepareFood(args, ctx.children);
  if (!r.ok) {
    return { success: false, error: r.error, terminal: r.terminal };
  }
  const { child, foodData } = r.prepared;
  const draftId = `draft_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  return {
    success: true,
    data: {
      draft_id: draftId,
      child_name: child.firstName,
      preview: foodData,
    },
    tile: {
      kind: "draft",
      data: {
        draftId,
        toolName: "log_food",
        // Pass the original args through so the apply endpoint can
        // re-run prepareFood with identical inputs (image_url may be
        // amended via the tile's Add Image button before Accept).
        args,
        preview: buildDiaryTile(
          draftId,
          child.id,
          ctx.userId,
          foodData,
          nowIso,
        ),
      },
    },
  };
}

async function proposeLogSleep(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = prepareSleep(args, ctx.children);
  if (!r.ok) {
    return { success: false, error: r.error, terminal: r.terminal };
  }
  const { child, sleepData } = r.prepared;
  const draftId = `draft_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  return {
    success: true,
    data: {
      draft_id: draftId,
      child_name: child.firstName,
      preview: sleepData,
    },
    tile: {
      kind: "draft",
      data: {
        draftId,
        toolName: "log_sleep",
        args,
        preview: buildDiaryTile(
          draftId,
          child.id,
          ctx.userId,
          sleepData,
          nowIso,
        ),
      },
    },
  };
}

async function proposeLogUpdate(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = prepareUpdate(args, ctx.children);
  if (!r.ok) {
    return { success: false, error: r.error, terminal: r.terminal };
  }
  const { child, updateData } = r.prepared;
  const draftId = `draft_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  return {
    success: true,
    data: {
      draft_id: draftId,
      child_name: child.firstName,
      preview: updateData,
    },
    tile: {
      kind: "draft",
      data: {
        draftId,
        toolName: "log_update",
        args,
        preview: buildDiaryTile(
          draftId,
          child.id,
          ctx.userId,
          updateData,
          nowIso,
        ),
      },
    },
  };
}

// ── Apply path (frontend-callable via /api/chat/drafts/accept) ───────────

export interface DiaryApplyResult {
  ok: true;
  tile: DiaryChatTile;
  data: { log_id: string; child_name: string };
}

export interface DiaryApplyError {
  ok: false;
  error: string;
}

export async function applyLogFood(
  args: Record<string, unknown>,
  ctx: { userId: string; children: ChildSummary[]; supabase: SupabaseClient },
): Promise<DiaryApplyResult | DiaryApplyError> {
  const r = prepareFood(args, ctx.children);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const { child, foodData } = r.prepared;

  const inserted = await insertLog(
    { userId: ctx.userId, supabase: ctx.supabase },
    {
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "diary",
      status: "completed",
      context: "adhoc",
      data: foodData,
    },
  );
  if (!inserted) {
    return { ok: false, error: "Failed to log food entry." };
  }

  const nowIso = new Date().toISOString();
  return {
    ok: true,
    data: { log_id: inserted.id, child_name: child.firstName },
    tile: buildDiaryTile(inserted.id, child.id, ctx.userId, foodData, nowIso),
  };
}

export async function applyLogSleep(
  args: Record<string, unknown>,
  ctx: { userId: string; children: ChildSummary[]; supabase: SupabaseClient },
): Promise<DiaryApplyResult | DiaryApplyError> {
  const r = prepareSleep(args, ctx.children);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const { child, sleepData } = r.prepared;

  const inserted = await insertLog(
    { userId: ctx.userId, supabase: ctx.supabase },
    {
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "diary",
      status: "completed",
      context: "adhoc",
      data: sleepData,
    },
  );
  if (!inserted) {
    return { ok: false, error: "Failed to log sleep entry." };
  }

  const nowIso = new Date().toISOString();
  return {
    ok: true,
    data: { log_id: inserted.id, child_name: child.firstName },
    tile: buildDiaryTile(inserted.id, child.id, ctx.userId, sleepData, nowIso),
  };
}

export async function applyLogUpdate(
  args: Record<string, unknown>,
  ctx: { userId: string; children: ChildSummary[]; supabase: SupabaseClient },
): Promise<DiaryApplyResult | DiaryApplyError> {
  const r = prepareUpdate(args, ctx.children);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const { child, updateData } = r.prepared;

  const inserted = await insertLog(
    { userId: ctx.userId, supabase: ctx.supabase },
    {
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "diary",
      status: "completed",
      context: "adhoc",
      data: updateData,
    },
  );
  if (!inserted) {
    return { ok: false, error: "Failed to save diary update." };
  }

  const nowIso = new Date().toISOString();
  return {
    ok: true,
    data: { log_id: inserted.id, child_name: child.firstName },
    tile: buildDiaryTile(inserted.id, child.id, ctx.userId, updateData, nowIso),
  };
}

// ── Module export ────────────────────────────────────────────────────────

export const diaryModule: BloomBotModule = {
  id: "diary",
  name: "Daily Diary",
  description:
    "Drafts daily-care diary entries — meals (log_food), sleep (log_sleep), and free-form parent-updates (log_update). Each tool returns a DRAFT tile the user must accept; nothing is inserted into bapp_logs until the user clicks Accept.",
  childScoped: true,

  tools: [
    {
      name: "log_food",
      description:
        "Draft a meal or snack the child has eaten. Returns a draft tile the user can Accept, Amend, or Dismiss. Prefer this when the user describes any food consumed (breakfast, lunch, dinner, snack). NOTE: nothing is logged until the user accepts the draft.",
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
          image_url: {
            type: "string",
            description:
              "Optional image URL if the user attached a photo (e.g. via `[Image attached: <url>]` in the user's message). Pass the URL verbatim.",
          },
        },
        required: ["meal_type", "items"],
      },
    },
    {
      name: "log_update",
      description:
        "Draft a free-form parent-update diary entry — a note describing what the carer has been up to with the child, captured for the parent to read. Returns a draft tile the user can Accept, Amend, or Dismiss. Use this for narrative updates ('We went to the park and had a great morning…') that don't fit the food / sleep / observation patterns. NOTE: nothing is logged until the user accepts.",
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
              "The update text — narrative description of what's been happening with the child.",
          },
          image_url: {
            type: "string",
            description:
              "Optional image URL to attach (Cloudinary or Supabase Storage URL).",
          },
        },
        required: ["note"],
      },
    },
    {
      name: "log_sleep",
      description:
        "Draft a nap or sleep session. Returns a draft tile the user can Accept, Amend, or Dismiss. NOTE: nothing is logged until the user accepts.",
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
          image_url: {
            type: "string",
            description:
              "Optional image URL if the user attached a photo (e.g. via `[Image attached: <url>]` in the user's message). Pass the URL verbatim.",
          },
        },
        required: ["duration_minutes"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "log_food") return proposeLogFood(args, ctx);
    if (toolName === "log_sleep") return proposeLogSleep(args, ctx);
    if (toolName === "log_update") return proposeLogUpdate(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Draft meals with `log_food`, sleep with `log_sleep`, and free-form parent-updates with `log_update`. `log_update` is for narrative notes — what the carer's been up to with the child, the kind of detail a parent reads to picture their day. Use it when the content is a story, not a structured meal/sleep/observation. Each call returns a DRAFT tile in the chat — the user clicks Accept to commit, Amend to revise, or Dismiss to drop. Do NOT tell the user the entry is logged after calling — say something like 'Drafted that update — review and accept when ready' and then stop. The user's button press finalises the entry.",
};
