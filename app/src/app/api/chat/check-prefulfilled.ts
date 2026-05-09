/**
 * checkPrefulfilled — route-level wrapper around a tool's
 * `isPrefulfilled` predicate.
 *
 * Per `Latency:Efficiency/06-implementation-plan.md §WU6`. Runs in
 * the route's `runTool` closure BEFORE the handler executes:
 *
 * - If the tool has no `isPrefulfilled` hook → `{ skip: false }`,
 *   route runs the handler as normal.
 * - If the predicate returns `false` → `{ skip: false }`, same.
 * - If the predicate returns `true` → `{ skip: true, result: ... }`,
 *   route emits the synthetic ToolResult instead of invoking the
 *   handler. Caller is responsible for tracking the skipped name in
 *   `metadata.tool_calls_skipped_by_prefulfilled`.
 *
 * The `tool_call` SSE event still fires regardless (handled in
 * `run-round-tools.ts`) so Katie sees what she asked for.
 *
 * The synthetic result note is fixed by spec — Katie reads it back
 * via the next-round functionResponse and knows the data is in her
 * runtime context block.
 */

import type { ToolDefinition, ToolResult } from "@/lib/chat/modules/types";
import type { PreloadedContext } from "@/lib/chat/preload/types";

export const PREFULFILLED_SYNTHETIC_NOTE =
  "data already in your runtime context — see 'Already loaded for you' block";

export type PrefulfilledOutcome =
  | { skip: false }
  | { skip: true; result: ToolResult };

export function checkPrefulfilled(
  tool: ToolDefinition | undefined,
  args: Record<string, unknown>,
  preload: PreloadedContext | undefined,
): PrefulfilledOutcome {
  if (!tool?.isPrefulfilled) return { skip: false };
  if (!tool.isPrefulfilled(args, preload)) return { skip: false };
  return {
    skip: true,
    result: {
      success: true,
      data: {
        source: "preload",
        note: PREFULFILLED_SYNTHETIC_NOTE,
      },
    },
  };
}
