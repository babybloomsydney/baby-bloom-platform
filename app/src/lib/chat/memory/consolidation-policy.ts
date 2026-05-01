/**
 * agent_memory consolidation — POLICY ONLY (WU 11.2 audit deliverable).
 *
 * Status: NOT IMPLEMENTED. This file exists to capture the gating
 * rules for when consolidation MAY run, so future implementation
 * doesn't have to re-derive them from conversation. The actual roll-
 * up logic (read raw notes → summarise via Gemini Flash → write
 * consolidated row → mark originals as superseded) is deferred until
 * one of the thresholds is observed in real usage.
 *
 * Why it isn't running today:
 *   The user's explicit preference is "give the full context if the
 *   memory file is only very small". An LLM round trip to summarise
 *   ten short notes costs more (in tokens AND in fidelity loss) than
 *   just sending the ten notes verbatim. Consolidation is therefore
 *   a tail-handling tool, not a default behaviour.
 *
 * The two-gate rule (BOTH must be met before consolidation fires):
 *
 *   1. SIGNIFICANT BLOAT — the raw memory has grown past the point
 *      where verbatim inclusion is cheap. We measure this two ways
 *      and require either trigger to count as "bloated":
 *        a. Row count > MEMORY_ROW_THRESHOLD (50 rows per bot)
 *        b. Total content size > MEMORY_BYTES_THRESHOLD (20 KB)
 *      Both signals matter — 200 one-word notes hits (a) but not
 *      (b); a single 30 KB free-text dump hits (b) but not (a).
 *      Either alone is sufficient for "bloated".
 *
 *   2. ACTUAL USAGE — the user has actively engaged with Katie
 *      recently enough to make consolidation worth paying for. We
 *      measure this as: ≥ MIN_RECENT_TURNS (20) chat_messages in
 *      the last RECENT_USAGE_WINDOW_DAYS (30) days. A user who
 *      hasn't touched Katie in months gets no consolidation —
 *      their memory will be fully present when they return, which
 *      is exactly what they need to re-orient.
 *
 * Both gates are AND-combined. A bloated memory belonging to an
 * inactive user stays raw (it's harmless as long as we're not paying
 * to send it every turn — and an inactive user isn't sending turns).
 *
 * The cron entry point would call:
 *   - For each active bot:
 *       if (await shouldConsolidate(botId, admin)) {
 *         await consolidateMemoryForBot(botId, admin);
 *       }
 * Frequency: weekly is enough. Even a power user won't cross the
 * row threshold daily.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Thresholds (export so tests + future cron reuse the same numbers) ─

/** Row count above which agent_memory is considered bloated (rows). */
export const MEMORY_ROW_THRESHOLD = 50;

/** Total content size above which agent_memory is considered bloated (bytes). */
export const MEMORY_BYTES_THRESHOLD = 20_000;

/** Minimum recent chat_messages for a user to count as "actively using Katie". */
export const MIN_RECENT_TURNS = 20;

/** Window size (days) for measuring recent usage. */
export const RECENT_USAGE_WINDOW_DAYS = 30;

// ── Decision function ────────────────────────────────────────────────

export interface ConsolidationDecision {
  shouldRun: boolean;
  reason: string;
  metrics: {
    row_count: number;
    bytes: number;
    recent_turns: number;
    bloated: boolean;
    actively_used: boolean;
  };
}

/**
 * Returns whether agent_memory consolidation should run for this bot
 * right now. Pure read; no side effects. Use as the gate before any
 * Gemini call.
 *
 * The function is implemented and tested even though the actual
 * consolidation step is not — landing the gate alone gives us the
 * "skip cheap cases" behaviour the user asked for the moment a
 * future WU wires in the summarisation step.
 */
export async function shouldConsolidate(
  botId: string,
  supabase: SupabaseClient,
): Promise<ConsolidationDecision> {
  // Bloat — query agent_memory rows for this bot and tally.
  const { data: memoryRows, error: memoryErr } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("bloombot_id", botId);
  if (memoryErr) {
    return {
      shouldRun: false,
      reason: `agent_memory read failed: ${memoryErr.message}`,
      metrics: {
        row_count: 0,
        bytes: 0,
        recent_turns: 0,
        bloated: false,
        actively_used: false,
      },
    };
  }
  const rows = (memoryRows ?? []) as Array<{ content: string }>;
  const rowCount = rows.length;
  const bytes = rows.reduce(
    (sum, r) => sum + (typeof r.content === "string" ? r.content.length : 0),
    0,
  );
  const bloated =
    rowCount > MEMORY_ROW_THRESHOLD || bytes > MEMORY_BYTES_THRESHOLD;

  // Active usage — count recent chat_messages.
  const since = new Date(
    Date.now() - RECENT_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count: turnsCount, error: msgsErr } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("bloombot_id", botId)
    .gte("created_at", since);
  if (msgsErr) {
    return {
      shouldRun: false,
      reason: `chat_messages count failed: ${msgsErr.message}`,
      metrics: {
        row_count: rowCount,
        bytes,
        recent_turns: 0,
        bloated,
        actively_used: false,
      },
    };
  }
  const recentTurns = turnsCount ?? 0;
  const activelyUsed = recentTurns >= MIN_RECENT_TURNS;

  if (!bloated) {
    return {
      shouldRun: false,
      reason:
        "memory is small — keeping full context is cheaper and higher-fidelity than summarising",
      metrics: {
        row_count: rowCount,
        bytes,
        recent_turns: recentTurns,
        bloated,
        actively_used: activelyUsed,
      },
    };
  }
  if (!activelyUsed) {
    return {
      shouldRun: false,
      reason:
        "user hasn't used Katie much recently — preserving raw memory is more useful than paying to summarise",
      metrics: {
        row_count: rowCount,
        bytes,
        recent_turns: recentTurns,
        bloated,
        actively_used: activelyUsed,
      },
    };
  }
  return {
    shouldRun: true,
    reason: "bloated AND actively used — consolidation worthwhile",
    metrics: {
      row_count: rowCount,
      bytes,
      recent_turns: recentTurns,
      bloated,
      actively_used: activelyUsed,
    },
  };
}
