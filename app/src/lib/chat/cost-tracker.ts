/**
 * Per-turn cost tracking for Katie AI calls.
 *
 * See system/APP/BLOOMBOT/COST-MODEL.md for pricing rationale and
 * monitoring queries. Rates are HARDCODED intentionally — we stamp each
 * row with the rate at time of use; updating RATES affects future rows only.
 *
 * Pricing (USD per 1M tokens), Flash + Pro:
 *   Flash  — input 0.50  output 3.00  cached 0.05
 *   Pro    — input 1.25  output 5.00  cached 0.125
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { GeminiModelId } from "@/lib/ai/model-selector";
import { GEMINI_MODELS } from "@/lib/ai/model-selector";
import { KATIE_DAILY_LIMIT_USD } from "./flags";

/** USD per 1M tokens by model + component. HARDCODED — update when pricing changes. */
const RATES = {
  [GEMINI_MODELS.flash]: {
    input_per_million: 0.5,
    output_per_million: 3.0,
    cached_per_million: 0.05,
  },
  [GEMINI_MODELS.pro]: {
    input_per_million: 1.25,
    output_per_million: 5.0,
    cached_per_million: 0.125,
  },
} as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

/**
 * Calculates USD cost for a single AI turn.
 * Stamp this value into chat_messages.metadata.cost_usd at write time.
 */
export function calculateMessageCost(
  model: GeminiModelId,
  usage: TokenUsage,
): number {
  const rates = RATES[model];
  if (!rates) {
    throw new Error(`Unknown model for cost calculation: ${model}`);
  }
  return (
    (usage.inputTokens * rates.input_per_million) / 1_000_000 +
    (usage.outputTokens * rates.output_per_million) / 1_000_000 +
    (usage.cachedTokens * rates.cached_per_million) / 1_000_000
  );
}

/**
 * Atomically upserts a cost row for today. Calls the SECURITY DEFINER
 * PG function `increment_chat_cost` to avoid race conditions across workers.
 *
 * Call AFTER every AI turn (reactive or proactive) completes.
 */
export async function updateDailyCost(
  botId: string,
  model: GeminiModelId,
  usage: TokenUsage,
  kind: "reactive" | "proactive" = "reactive",
): Promise<number> {
  const cost = calculateMessageCost(model, usage);
  const admin = createAdminClient();
  const { error } = await admin.rpc("increment_chat_cost", {
    p_bot_id: botId,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_cached_tokens: usage.cachedTokens,
    p_cost: cost,
    p_is_proactive: kind === "proactive",
  });
  if (error) {
    console.error("[cost-tracker] increment_chat_cost failed", {
      botId,
      error,
    });
    // Non-fatal: don't block the user on cost-tracking errors. Log + carry on.
  }
  return cost;
}

export interface DailyCostState {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  estimated_cost_usd: number;
  turn_count: number;
  proactive_count: number;
}

/**
 * Reads today's cost state for a bot. Returns zeros if no row yet.
 */
export async function getDailyCost(botId: string): Promise<DailyCostState> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("chat_cost_daily")
    .select(
      "date, input_tokens, output_tokens, cached_tokens, estimated_cost_usd, turn_count, proactive_count",
    )
    .eq("bloombot_id", botId)
    .eq("date", today)
    .maybeSingle();

  if (error) {
    console.error("[cost-tracker] getDailyCost failed", { botId, error });
  }

  if (!data) {
    return {
      date: today,
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      estimated_cost_usd: 0,
      turn_count: 0,
      proactive_count: 0,
    };
  }
  return data as DailyCostState;
}

export interface LimitCheckResult {
  allowed: boolean;
  spent: number;
  remaining: number;
  limit: number;
  /** Soft cap = 90% of limit. Above this, proactive AI tiers should degrade to templates. */
  nearCap: boolean;
}

/**
 * Checks whether the bot is under the daily cost cap. Used by the chat
 * API route (reactive) and the proactive dispatcher.
 */
export async function checkDailyLimit(
  botId: string,
): Promise<LimitCheckResult> {
  const state = await getDailyCost(botId);
  const limit = KATIE_DAILY_LIMIT_USD;
  const spent = state.estimated_cost_usd;
  return {
    allowed: spent < limit,
    spent,
    remaining: Math.max(0, limit - spent),
    limit,
    nearCap: spent >= limit * 0.9,
  };
}
