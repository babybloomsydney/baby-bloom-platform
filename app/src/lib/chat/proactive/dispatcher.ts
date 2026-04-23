/**
 * Proactive dispatcher — consumes proactive_schedules rows whose
 * next_run_at ≤ now and fires messages.
 *
 * Called from /api/cron/proactive every 15 minutes. Also safe to call
 * manually during development.
 *
 * Policy:
 *   - Only fire when now() is inside bot.settings.waking_hours
 *     (default 07:00–22:00 Australia/Sydney).
 *   - Template mode renders verbatim with {child_name}/{today}
 *     interpolation. No AI cost.
 *   - ai-minimal mode makes one Gemini call with a minimal system
 *     prompt + the schedule's prompt_fragment. No tools. Single turn.
 *   - ai-full is deferred — requires reproducing the chat route
 *     agentic loop. Current cron just skips ai-full with
 *     last_status='skipped_ai_full'.
 *
 * After firing:
 *   - Insert chat_messages (role='assistant', is_read=false,
 *     trigger_source='proactive', proactive_trigger_id=<trigger_id>).
 *   - If cron_expr: recompute next_run_at to the next occurrence.
 *   - If one_time_at: set active=false (single-fire).
 *   - Update last_run_at / last_status / last_error.
 */

import { CronExpressionParser } from "cron-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generate } from "@/lib/ai/gemini-client";
import { selectGeminiModel, type BotRole } from "@/lib/ai/model-selector";

export interface WakingHours {
  start: string; // HH:MM
  end: string; // HH:MM
  timezone: string; // IANA
}

const DEFAULT_WAKING: WakingHours = {
  start: "07:00",
  end: "22:00",
  timezone: "Australia/Sydney",
};

function parseHHMMToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function inWakingHours(
  hours: WakingHours | undefined,
  now: Date,
): boolean {
  const hrs = hours ?? DEFAULT_WAKING;
  const start = parseHHMMToMinutes(hrs.start);
  const end = parseHHMMToMinutes(hrs.end);
  if (start == null || end == null || start >= end) return false;

  // Project `now` into the bot's timezone to compare minutes-of-day.
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: hrs.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = h * 60 + m;
  return mins >= start && mins < end;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

interface ScheduleRow {
  id: string;
  bloombot_id: string;
  child_client_id: string | null;
  trigger_id: string;
  description: string;
  cron_expr: string | null;
  one_time_at: string | null;
  timezone: string;
  next_run_at: string;
  mode: "template" | "ai-minimal" | "ai-full";
  template: string | null;
  prompt_fragment: string | null;
  payload: Record<string, unknown>;
  active: boolean;
}

interface BotRow {
  id: string;
  user_id: string;
  role: BotRole;
  settings: { waking_hours?: WakingHours } | null;
}

interface ChildRow {
  id: string;
  first_name: string;
}

export interface DispatchResult {
  schedule_id: string;
  status: "fired" | "skipped_waking" | "skipped_ai_full" | "error";
  reason?: string;
  message_id?: string;
  next_run_at?: string;
}

async function fireTemplate(
  row: ScheduleRow,
  bot: BotRow,
  child: ChildRow | null,
  admin: SupabaseClient,
): Promise<{ content: string; messageId: string | null }> {
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    timeZone: row.timezone,
  });
  const content = renderTemplate(row.template ?? "", {
    child_name: child?.first_name ?? "your child",
    today,
  });

  const { data } = await admin
    .from("chat_messages")
    .insert({
      bloombot_id: bot.id,
      role: "assistant",
      content,
      trigger_source: "proactive",
      proactive_trigger_id: row.trigger_id,
      is_read: false,
      metadata: {
        mode: "template",
        schedule_id: row.id,
        description: row.description,
      },
    })
    .select("id")
    .single();

  return { content, messageId: (data as { id: string } | null)?.id ?? null };
}

async function fireAiMinimal(
  row: ScheduleRow,
  bot: BotRow,
  child: ChildRow | null,
  admin: SupabaseClient,
): Promise<{ content: string; messageId: string | null }> {
  const model = selectGeminiModel(bot.role);
  const contextBlock = [
    child ? `You are addressing about ${child.first_name}.` : "",
    `Today is ${new Date().toLocaleDateString("en-AU", { weekday: "long", timeZone: row.timezone })}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const systemPrompt = [
    "You are Katie, the user's proactive assistant. You are sending a short, unsolicited message.",
    "Keep it under 3 sentences. No preamble, no sign-off. Sound human, not scripted.",
    contextBlock,
    "",
    row.prompt_fragment ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const resp = await generate({
    model,
    systemPrompt,
    contents: [
      {
        role: "user",
        parts: [{ text: row.description }],
      },
    ],
  });

  const content = (resp.text ?? "").trim() || "…";
  const { data } = await admin
    .from("chat_messages")
    .insert({
      bloombot_id: bot.id,
      role: "assistant",
      content,
      trigger_source: "proactive",
      proactive_trigger_id: row.trigger_id,
      is_read: false,
      metadata: {
        mode: "ai-minimal",
        schedule_id: row.id,
        description: row.description,
        model,
      },
    })
    .select("id")
    .single();

  return { content, messageId: (data as { id: string } | null)?.id ?? null };
}

async function updateScheduleAfterFire(
  row: ScheduleRow,
  status: DispatchResult["status"],
  reason: string | undefined,
  admin: SupabaseClient,
): Promise<string | undefined> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_run_at: now,
    last_status: status,
    last_error: reason ?? null,
  };

  let nextRunAt: string | undefined;
  if (row.cron_expr) {
    try {
      const it = CronExpressionParser.parse(row.cron_expr, {
        tz: row.timezone,
      });
      nextRunAt = it.next().toDate().toISOString();
      patch.next_run_at = nextRunAt;
    } catch {
      // Leave next_run_at alone; dispatcher will keep re-reading it
      // next tick — which will spin. Best-effort: deactivate.
      patch.active = false;
      patch.last_error = `cron parse failed; deactivating`;
    }
  } else {
    // one_time_at — single fire, deactivate after success.
    patch.active = false;
  }

  await admin.from("proactive_schedules").update(patch).eq("id", row.id);
  return nextRunAt;
}

export async function runDueSchedules(
  admin: SupabaseClient,
  now: Date = new Date(),
  limit = 50,
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  const { data: rows, error } = await admin
    .from("proactive_schedules")
    .select()
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (error || !rows || rows.length === 0) return results;

  // Batch-load bots + children referenced by this tick.
  const botIds = Array.from(
    new Set((rows as ScheduleRow[]).map((r) => r.bloombot_id)),
  );
  const childIds = Array.from(
    new Set(
      (rows as ScheduleRow[])
        .map((r) => r.child_client_id)
        .filter((id): id is string => id !== null),
    ),
  );

  const { data: bots } = await admin
    .from("bloombot")
    .select("id, user_id, role, settings")
    .in("id", botIds);
  const botMap = new Map<string, BotRow>();
  for (const b of (bots ?? []) as BotRow[]) botMap.set(b.id, b);

  const childMap = new Map<string, ChildRow>();
  if (childIds.length > 0) {
    const { data: children } = await admin
      .from("child_client")
      .select("id, first_name")
      .in("id", childIds);
    for (const c of (children ?? []) as ChildRow[]) childMap.set(c.id, c);
  }

  for (const row of rows as ScheduleRow[]) {
    const bot = botMap.get(row.bloombot_id);
    if (!bot) {
      results.push({
        schedule_id: row.id,
        status: "error",
        reason: "bot not found",
      });
      await updateScheduleAfterFire(row, "error", "bot not found", admin);
      continue;
    }

    if (!inWakingHours(bot.settings?.waking_hours, now)) {
      results.push({ schedule_id: row.id, status: "skipped_waking" });
      // Don't advance next_run_at — we want to re-try at the next tick
      // once we're inside the window. Update last_run_at timestamp so
      // the row isn't totally inert.
      await admin
        .from("proactive_schedules")
        .update({
          last_run_at: now.toISOString(),
          last_status: "skipped_waking",
        })
        .eq("id", row.id);
      continue;
    }

    const child = row.child_client_id
      ? (childMap.get(row.child_client_id) ?? null)
      : null;

    try {
      if (row.mode === "template") {
        const { messageId } = await fireTemplate(row, bot, child, admin);
        const nextRunAt = await updateScheduleAfterFire(
          row,
          "fired",
          undefined,
          admin,
        );
        results.push({
          schedule_id: row.id,
          status: "fired",
          message_id: messageId ?? undefined,
          next_run_at: nextRunAt,
        });
      } else if (row.mode === "ai-minimal") {
        const { messageId } = await fireAiMinimal(row, bot, child, admin);
        const nextRunAt = await updateScheduleAfterFire(
          row,
          "fired",
          undefined,
          admin,
        );
        results.push({
          schedule_id: row.id,
          status: "fired",
          message_id: messageId ?? undefined,
          next_run_at: nextRunAt,
        });
      } else {
        // ai-full deferred
        await updateScheduleAfterFire(
          row,
          "skipped_ai_full",
          "ai-full mode not yet implemented in dispatcher",
          admin,
        );
        results.push({ schedule_id: row.id, status: "skipped_ai_full" });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await updateScheduleAfterFire(row, "error", reason, admin);
      results.push({ schedule_id: row.id, status: "error", reason });
    }
  }

  return results;
}
