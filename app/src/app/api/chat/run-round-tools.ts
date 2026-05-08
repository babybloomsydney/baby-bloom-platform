/**
 * runRoundTools — executes a round of tool calls and emits SSE events.
 *
 * Latency:Efficiency build, WU3 (F1 — parallel tool execution within
 * a Gemini round). Extracted from the route's agentic loop so it can
 * be unit-tested in isolation without spinning up the whole route.
 *
 * Two paths, gated by `parallelEnabled`:
 *
 * 1. Parallel (default, `KATIE_PARALLEL_TOOLS_ENABLED=true`):
 *    - Emit `tool_call` events upfront, in original order.
 *    - Execute every call concurrently via `Promise.all`.
 *    - Iterate resolved results in ORIGINAL order to emit
 *      `tool_result` + `tile` events. This preserves the SSE event
 *      order Katie's UI expects, even when tools resolve out of order.
 *    - "Last tile wins": iterating in original order means the LAST
 *      tile in `roundCalls` wins, regardless of resolution timing —
 *      identical to the serial path.
 *    - Errors thrown by `runTool` are caught and converted to a
 *      failed `ToolResult` so other tools in the round still
 *      complete normally.
 *
 * 2. Serial (`KATIE_PARALLEL_TOOLS_ENABLED=false`):
 *    - The original for-loop. Each tool's `tool_call` event fires,
 *      then `await runTool`, then `tool_result` + `tile` events.
 *    - Used as a kill-switch fallback when the parallel path needs
 *      to be disabled in production.
 *
 * Spec: `system/APP/BLOOMBOT/Latency:Efficiency/06-implementation-plan.md §WU3`
 */

import { isChatTile, type ChatTile } from "@/lib/chat/tiles";
import type { ToolResult } from "@/lib/chat/modules/types";

/**
 * Discriminated union of every event this helper emits to the SSE
 * sink. Closed protocol — adding a new variant is a compile-time
 * change at every call site.
 */
export type RoundEvent =
  | { type: "tool_call"; name?: string; args?: unknown }
  | { type: "tool_result"; name?: string; result: ToolResult }
  | { type: "tile"; tile: ChatTile };

export interface RoundToolsInput {
  roundCalls: Array<{ name?: string; args?: unknown }>;
  /** Per `KATIE_PARALLEL_TOOLS_ENABLED`. When true, tools run via
   *  Promise.all; when false, serially. */
  parallelEnabled: boolean;
  /** Caller-supplied tool runner. The route's runTool wraps the
   *  module registry's findToolHandler + execute call; this helper
   *  doesn't need to know about modules. */
  runTool: (call: { name?: string; args?: unknown }) => Promise<ToolResult>;
  /** Caller-supplied SSE event sink. Receives the discriminated
   *  `RoundEvent` so the route can narrow on `type` without unsafe
   *  casts. The route encodes + writes to the SSE controller; tests
   *  pass a sink that just records events. */
  enqueue: (event: RoundEvent) => void;
}

export interface RoundToolsOutput {
  /** Tool results in ORIGINAL call order — even if execution was
   *  parallel and resolved out of order. */
  results: ToolResult[];
  /** The "last tile wins" pick. Last `roundCalls` entry whose result
   *  attached a valid ChatTile, in ORIGINAL order. Null when no tool
   *  attached a tile. */
  persistedTile: ChatTile | null;
  /** Whether the parallel path actually executed. Surfaces in
   *  metadata.parallel_tools_used for telemetry. */
  parallelToolsUsed: boolean;
}

export async function runRoundTools(
  input: RoundToolsInput,
): Promise<RoundToolsOutput> {
  const { roundCalls, parallelEnabled, runTool, enqueue } = input;

  if (parallelEnabled) {
    return runParallel(roundCalls, runTool, enqueue);
  }
  return runSerial(roundCalls, runTool, enqueue);
}

/**
 * Wraps a single `runTool` invocation in a try/catch that converts
 * thrown errors into a failed `ToolResult` AND logs the full error
 * server-side. The model only sees the `error` string in the
 * functionResponse; logs preserve the stack trace for diagnosis.
 */
async function safeRunTool(
  call: { name?: string; args?: unknown },
  runTool: RoundToolsInput["runTool"],
): Promise<ToolResult> {
  try {
    return await runTool(call);
  } catch (err) {
    console.error("[runRoundTools] tool threw:", {
      name: call.name,
      err,
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "tool execution failed",
    };
  }
}

/**
 * Emits the post-execution events (tool_result + tile) for one
 * resolved tool. Iterating in ORIGINAL order across the array
 * preserves SSE order + "last tile wins" semantics regardless of
 * which path resolved first.
 *
 * Tiles attached to FAILED tool results are NOT persisted — a tool
 * that errors but happens to also attach a tile shouldn't write a
 * "successful" tile to chat_messages. This mirrors what the route's
 * downstream chat_messages insert would do anyway.
 */
function emitResult(
  call: { name?: string; args?: unknown },
  result: ToolResult,
  enqueue: RoundToolsInput["enqueue"],
  current: ChatTile | null,
): ChatTile | null {
  enqueue({ type: "tool_result", name: call.name, result });
  if (result.success && result.tile && isChatTile(result.tile)) {
    enqueue({ type: "tile", tile: result.tile });
    return result.tile;
  }
  return current;
}

async function runParallel(
  roundCalls: RoundToolsInput["roundCalls"],
  runTool: RoundToolsInput["runTool"],
  enqueue: RoundToolsInput["enqueue"],
): Promise<RoundToolsOutput> {
  // Emit every tool_call event upfront in original order, so the
  // user sees Katie "asking" in the same sequence regardless of
  // resolution timing.
  for (const call of roundCalls) {
    enqueue({ type: "tool_call", name: call.name, args: call.args });
  }

  // Execute all in parallel. Each runTool is wrapped so a thrown
  // error becomes a failed ToolResult and never rejects Promise.all.
  //
  // Note on terminal short-circuit semantics: the route's terminal
  // check at route.ts:~677 fires AFTER this helper returns. The
  // ORIGINAL serial path also ran every tool in the round before
  // that check (the for-loop had no break-on-terminal), so the
  // parallel path preserves identical semantics — every tool in the
  // round runs regardless of whether a peer returned terminal:true.
  // Terminal only stops FUTURE rounds, not sibling tools in the
  // same round. This is by design.
  const results = await Promise.all(
    roundCalls.map((call) => safeRunTool(call, runTool)),
  );

  // Iterate in ORIGINAL order — preserves SSE event ordering and
  // "last tile wins" semantics.
  let persistedTile: ChatTile | null = null;
  for (let i = 0; i < roundCalls.length; i++) {
    persistedTile = emitResult(
      roundCalls[i],
      results[i],
      enqueue,
      persistedTile,
    );
  }

  return { results, persistedTile, parallelToolsUsed: true };
}

async function runSerial(
  roundCalls: RoundToolsInput["roundCalls"],
  runTool: RoundToolsInput["runTool"],
  enqueue: RoundToolsInput["enqueue"],
): Promise<RoundToolsOutput> {
  const results: ToolResult[] = [];
  let persistedTile: ChatTile | null = null;

  for (const call of roundCalls) {
    enqueue({ type: "tool_call", name: call.name, args: call.args });
    const result = await safeRunTool(call, runTool);
    results.push(result);
    persistedTile = emitResult(call, result, enqueue, persistedTile);
  }

  return { results, persistedTile, parallelToolsUsed: false };
}
