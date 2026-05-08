/**
 * Action-triggered proactive dispatcher.
 *
 * Called from server actions after a real event happens (user applied
 * to a job, logged an observation, got accepted for a booking, etc.).
 * Looks up the recipient's bot + the module-registered ProactiveTrigger
 * by id, runs the trigger's condition + resolvePayload, renders a
 * message, and persists it on chat_messages.
 *
 * Failure policy: proactive dispatch is a side effect of the real
 * action. It must NEVER propagate an error back to the server action.
 * Every failure is logged + swallowed so the main action succeeds
 * even if Katie's narration doesn't.
 *
 * Comparison to runDueSchedules (./dispatcher.ts):
 *   - runDueSchedules runs on cron, reads from proactive_schedules
 *     table, fires time-based triggers (Katie-scheduled or default
 *     seeded tier-3).
 *   - dispatchActionTriggered runs synchronously in server actions,
 *     fires module-registered triggers that don't have a schedule row.
 *     Event data is passed in by the caller.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generate } from "@/lib/ai/gemini-client";
import { selectGeminiModel, type BotRole } from "@/lib/ai/model-selector";
import { findProactiveTrigger } from "@/lib/chat/modules/registry";
import type {
  ModuleContext,
  ProactiveTrigger,
  SiteEvent,
} from "@/lib/chat/modules/types";
import { inWakingHours, renderTemplate } from "./dispatcher";
import type { BotSettings } from "@/types/bapp";

export interface DispatchActionTriggeredInput {
  /** Trigger id as declared on a module's proactiveTriggers array. */
  triggerId: string;
  /** The user whose bot should narrate this. */
  recipientUserId: string;
  /** Event payload — becomes `event.payload` passed to the trigger. */
  payload?: Record<string, unknown>;
}

export type DispatchActionTriggeredResult =
  | { status: "fired"; messageId: string }
  | { status: "skipped_no_bot" }
  | { status: "skipped_unknown_trigger" }
  | { status: "skipped_waking" }
  | { status: "skipped_condition" }
  | { status: "skipped_ai_full" }
  | { status: "error"; error: string };

interface BotRow {
  id: string;
  user_id: string;
  role: BotRole;
  /** Typed off canonical `BotSettings` so per-bot module gating
   *  (`enabledForBot`) reads consistently with the chat route + the
   *  cron dispatcher. The chat route, cron dispatcher, and action-
   *  triggered dispatcher must all agree on which modules are active
   *  for the same bot — divergence means a proactive message could
   *  fire with a tool the user never sees in Katie's main path. */
  settings: BotSettings | null;
}

/**
 * Load the recipient's bot, the trigger definition, and enough context
 * to call resolvePayload + condition. Returns null when the user has
 * no bot yet (silent skip) or the trigger isn't in the registry.
 *
 * This function deliberately keeps ModuleContext minimal — action-
 * triggered proactive doesn't need full children access or
 * currentSurface tracking, and loading those synchronously inside
 * every write action would add noticeable latency.
 */
interface ResolvedTrigger {
  module: unknown;
  trigger: ProactiveTrigger;
}

async function loadContext(input: DispatchActionTriggeredInput): Promise<
  | {
      kind: "ok";
      bot: BotRow;
      trigger: ResolvedTrigger;
      ctx: ModuleContext;
      admin: SupabaseClient;
    }
  | { kind: "skip"; status: "skipped_no_bot" | "skipped_unknown_trigger" }
> {
  const admin = createAdminClient() as SupabaseClient;

  const { data: botRow } = await admin
    .from("bloombot")
    .select("id, user_id, role, settings")
    .eq("user_id", input.recipientUserId)
    .maybeSingle();

  if (!botRow) {
    // No bot yet — user hasn't opened Katie. Silently skip; we can't
    // dispatch a message to a non-existent inbox.
    return { kind: "skip", status: "skipped_no_bot" };
  }
  const bot = botRow as BotRow;

  const resolved = findProactiveTrigger(
    input.triggerId,
    bot.role,
    bot.settings ?? undefined,
  );
  if (!resolved) {
    return { kind: "skip", status: "skipped_unknown_trigger" };
  }

  const ctx: ModuleContext = {
    botId: bot.id,
    userId: bot.user_id,
    userRole: bot.role,
    effectiveRole: bot.role,
    // Action-triggered dispatch doesn't need full child context. Keeping
    // it empty avoids a load on every server action; trigger authors
    // should resolve children themselves from the payload if they need
    // names.
    children: [],
    currentSurface: null,
    supabase: admin,
  };

  return { kind: "ok", bot, trigger: resolved, ctx, admin };
}

async function fireTemplateMessage(
  trigger: ResolvedTrigger,
  vars: Record<string, string>,
  bot: BotRow,
  admin: SupabaseClient,
  fallbackToFragment: boolean,
): Promise<string | null> {
  const template =
    trigger.trigger.template ??
    (fallbackToFragment ? trigger.trigger.fallbackTemplate : undefined) ??
    "";
  if (!template) return null;

  const content = renderTemplate(template, vars);
  const { data } = await admin
    .from("chat_messages")
    .insert({
      bloombot_id: bot.id,
      role: "assistant",
      content,
      trigger_source: "proactive",
      proactive_trigger_id: trigger.trigger.id,
      is_read: false,
      metadata: {
        mode: "template",
        trigger_description: trigger.trigger.description,
      },
    })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

async function fireAiMinimalMessage(
  trigger: ResolvedTrigger,
  payloadVars: Record<string, unknown>,
  bot: BotRow,
  admin: SupabaseClient,
): Promise<string | null> {
  const model = selectGeminiModel(bot.role);
  // Include payload keys in the system prompt so Gemini has the
  // specific facts to work from without having to re-derive them.
  const payloadContext = Object.entries(payloadVars)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join("\n");

  const systemPrompt = [
    "You are Katie, the user's proactive assistant. You are sending a short, unsolicited message to narrate something that just happened.",
    "Keep it under 3 sentences. No preamble, no sign-off. Sound human, not scripted.",
    trigger.trigger.promptFragment ?? "",
    payloadContext ? `Event data:\n${payloadContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const resp = await generate({
    model,
    systemPrompt,
    contents: [
      {
        role: "user",
        parts: [{ text: trigger.trigger.description }],
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
      proactive_trigger_id: trigger.trigger.id,
      is_read: false,
      metadata: {
        mode: "ai-minimal",
        trigger_description: trigger.trigger.description,
        model,
      },
    })
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Core entry point — called from server actions after an event.
 *
 * Swallows all errors; logs them. Never throws back to the caller.
 * Server actions treat the proactive message as a best-effort side
 * effect, not a dependency of the main transaction.
 */
export async function dispatchActionTriggered(
  input: DispatchActionTriggeredInput,
): Promise<DispatchActionTriggeredResult> {
  try {
    const loaded = await loadContext(input);
    if (loaded.kind === "skip") return { status: loaded.status };
    const { bot, trigger, ctx, admin } = loaded;
    // `trigger` is already guaranteed non-null on the "ok" branch
    // (loadContext returns kind:"skip" when findProactiveTrigger
    // returned null). Typed as ResolvedTrigger so TS narrows cleanly
    // without a `!` assertion.
    const triggerDef = trigger.trigger;

    if (!inWakingHours(bot.settings?.waking_hours, new Date())) {
      return { status: "skipped_waking" };
    }

    const event: SiteEvent = {
      source: "event",
      payload: input.payload ?? {},
    };

    if (triggerDef.condition) {
      const shouldFire = await triggerDef.condition(event, ctx);
      if (!shouldFire) return { status: "skipped_condition" };
    }

    const resolved = await triggerDef.resolvePayload(event, ctx);
    // Coerce to string map for template interpolation. Non-string
    // values render as their String() form.
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(resolved)) {
      vars[k] = v == null ? "" : String(v);
    }

    if (triggerDef.mode === "template") {
      const messageId = await fireTemplateMessage(
        trigger,
        vars,
        bot,
        admin,
        false,
      );
      if (!messageId) {
        return {
          status: "error",
          error: "template trigger had no template string",
        };
      }
      return { status: "fired", messageId };
    }

    if (triggerDef.mode === "ai-minimal") {
      const messageId = await fireAiMinimalMessage(
        trigger,
        resolved,
        bot,
        admin,
      );
      if (!messageId) {
        return {
          status: "error",
          error: "ai-minimal trigger failed to persist",
        };
      }
      return { status: "fired", messageId };
    }

    // ai-full — deferred; requires full agentic loop. For now, drop to
    // fallback template if declared, else skip.
    if (triggerDef.fallbackTemplate) {
      const messageId = await fireTemplateMessage(
        trigger,
        vars,
        bot,
        admin,
        true,
      );
      if (messageId) return { status: "fired", messageId };
    }
    return { status: "skipped_ai_full" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(
      `[proactive] dispatchActionTriggered failed for trigger ${input.triggerId}, recipient ${input.recipientUserId}:`,
      error,
    );
    return { status: "error", error };
  }
}

/**
 * Fire-and-forget wrapper. Server actions call this inline; the
 * promise is intentionally not awaited so the server action's own
 * latency is unaffected. Errors are still caught (the inner function
 * never throws).
 *
 * Logs a warning when the dispatch returns `status: 'error'`. The
 * server action never sees that status (the promise is unawaited),
 * so without this log a misconfigured trigger — e.g. template mode
 * with no template string — would fail completely silently. Known
 * skip statuses (no_bot / unknown_trigger / waking / condition /
 * ai_full) are intentional and stay silent.
 */
export function dispatchActionTriggeredInBackground(
  input: DispatchActionTriggeredInput,
): void {
  void dispatchActionTriggered(input)
    .then((result) => {
      if (result.status === "error") {
        console.warn(
          `[proactive] trigger ${input.triggerId} returned error for recipient ${input.recipientUserId}:`,
          result.error,
        );
      }
    })
    .catch((err) => {
      // Belt-and-braces — dispatchActionTriggered already catches, but
      // `.catch` here guarantees an unhandled rejection can't escape.
      console.error("[proactive] background dispatch error:", err);
    });
}
