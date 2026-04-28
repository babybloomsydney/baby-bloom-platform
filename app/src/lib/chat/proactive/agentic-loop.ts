/**
 * Scheduled-fire agentic loop — the cron-side analogue of the chat
 * route's tool-calling loop.
 *
 * Differences from the chat route:
 *   - No SSE streaming. The whole response is collected and returned
 *     in one shot for batch persistence.
 *   - Lower MAX_ROUNDS default (3) — proactive triggers are short
 *     scheduled moments, not multi-round agentic chains. The chat
 *     route's interactive loop allows 5.
 *   - Returns the LAST tile produced — chat_messages.tile only stores
 *     one tile per row. If Katie chained multiple `create_tile`s
 *     (rare), only the most recent is rendered inline; the others
 *     still landed in `bapp_logs` and surface in the feed normally.
 *
 * Mirrors the same `echoModelParts` + `functionResponse` protocol so
 * Gemini 3 doesn't 400 on round-trips (see WU 0.6 spike findings).
 *
 * Cost-cap is the caller's responsibility — this loop just runs.
 */

import {
  generate,
  echoModelParts,
  type GeminiTool,
  type GeminiTurn,
  type GeminiModelId,
} from "@/lib/ai/gemini-client";
import type { ToolResult } from "@/lib/chat/modules/types";
import { isChatTile, type ChatTile } from "@/lib/chat/tiles";
import type { TokenUsage } from "@/lib/chat/cost-tracker";

const DEFAULT_MAX_ROUNDS = 3;

export interface ScheduledAgenticArgs {
  model: GeminiModelId;
  systemPrompt: string;
  /** First turn — the trigger ask, e.g. the schedule's prompt_fragment. */
  initialPromptText: string;
  tools: GeminiTool[] | undefined;
  /**
   * Caller-supplied tool dispatcher. Should never throw — but if it
   * does, the loop captures the exception and feeds it back as a
   * failed function response so Gemini can recover gracefully.
   */
  runTool: (call: { name?: string; args?: unknown }) => Promise<ToolResult>;
  /** Override for tests + future tuning. Default 3. */
  maxRounds?: number;
}

export interface ScheduledAgenticResult {
  fullText: string;
  lastTile: ChatTile | null;
  usage: TokenUsage;
}

interface UsageMeta {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

function accrueUsage(acc: TokenUsage, u: UsageMeta | undefined): TokenUsage {
  if (!u) return acc;
  return {
    inputTokens: acc.inputTokens + (u.promptTokenCount ?? 0),
    outputTokens: acc.outputTokens + (u.candidatesTokenCount ?? 0),
    cachedTokens: acc.cachedTokens + (u.cachedContentTokenCount ?? 0),
  };
}

export async function runScheduledAgenticLoop(
  args: ScheduledAgenticArgs,
): Promise<ScheduledAgenticResult> {
  const maxRounds = args.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const turns: GeminiTurn[] = [
    { role: "user", parts: [{ text: args.initialPromptText }] },
  ];

  let fullText = "";
  let lastTile: ChatTile | null = null;
  let usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
  };

  for (let round = 0; round < maxRounds; round++) {
    const resp = await generate({
      model: args.model,
      systemPrompt: args.systemPrompt,
      contents: turns,
      tools: args.tools,
    });
    usage = accrueUsage(usage, resp.usageMetadata);

    const calls = resp.functionCalls ?? [];
    const text = resp.text ?? "";
    if (text) fullText += text;

    if (calls.length === 0) {
      // Model converged to text — done.
      break;
    }

    const modelParts = resp.candidates?.[0]?.content?.parts;
    if (!modelParts) {
      // Defensive — Gemini returned tool calls but no content parts.
      // Surfaces in cron logs so we can spot SDK protocol drift; the
      // caller still gets a clean exit with whatever text was already
      // accumulated.
      console.warn(
        "[agentic-loop] tool calls returned without content parts; bailing",
        { round, callCount: calls.length },
      );
      break;
    }

    const results: ToolResult[] = [];
    for (const call of calls) {
      let result: ToolResult;
      try {
        result = await args.runTool(call);
      } catch (err) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : "tool execution failed",
        };
      }
      results.push(result);
      if (result.tile && isChatTile(result.tile)) {
        lastTile = result.tile;
      }
    }

    turns.push(echoModelParts(modelParts));
    turns.push({
      role: "user",
      parts: calls.map((call, i) => ({
        functionResponse: {
          name: call.name ?? "",
          // results[i] is index-aligned to calls[i] by construction
          // above. The `as unknown as Record<string, unknown>` is the
          // SDK-required shape for functionResponse.response — invariant
          // is "ToolResult is a JSON-shaped object", which holds for all
          // module return values.
          response: results[i] as unknown as Record<string, unknown>,
        },
      })),
    });
  }

  return { fullText, lastTile, usage };
}
