import { describe, it, expect } from "vitest";
import { runRoundTools, type RoundEvent } from "./run-round-tools";
import type { ToolResult } from "@/lib/chat/modules/types";
import type { ChatTile } from "@/lib/chat/tiles";

/**
 * Per `Latency:Efficiency/07-test-plan.md §WU3`:
 *
 * 1. Single tool call: parallel matches serial.
 * 2. Three tools: parallel start times overlap.
 * 3. SSE event order preserved when resolution order differs.
 * 4. One tool throws → others complete; failure isolated.
 * 5. "Last tile wins" preserved regardless of resolution order.
 * 6. Flag off → sequential start times.
 * 7. Returns `parallelToolsUsed` boolean for telemetry.
 */

type SseEvent = RoundEvent;

function tile(id: string): ChatTile {
  // Minimal valid katie_note ChatTile that passes isChatTile()'s
  // per-kind shape check (requires non-empty `data.body`).
  return { kind: "katie_note", data: { body: id } } as unknown as ChatTile;
}

describe("runRoundTools — parallel and serial paths", () => {
  it("single tool call: parallel path produces same output as serial path", async () => {
    const events: SseEvent[] = [];
    const result = await runRoundTools({
      roundCalls: [{ name: "t1", args: { a: 1 } }],
      parallelEnabled: true,
      runTool: async () => ({ success: true, data: "ok" }) as ToolResult,
      enqueue: (evt) => events.push(evt),
    });
    expect(result.results).toHaveLength(1);
    expect(result.parallelToolsUsed).toBe(true);
    // Events: tool_call → tool_result for the single tool.
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
  });

  it("three parallel tools: start times overlap (within ~50ms)", async () => {
    const startTimes: number[] = [];
    await runRoundTools({
      roundCalls: [
        { name: "t1", args: {} },
        { name: "t2", args: {} },
        { name: "t3", args: {} },
      ],
      parallelEnabled: true,
      runTool: async () => {
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 30));
        return { success: true } as ToolResult;
      },
      enqueue: () => {},
    });
    expect(startTimes).toHaveLength(3);
    const spread = Math.max(...startTimes) - Math.min(...startTimes);
    expect(spread).toBeLessThan(50);
  });

  it("SSE event order preserved when tools resolve out of order", async () => {
    const events: SseEvent[] = [];
    // t3 resolves first (10ms), t1 last (50ms). Events should still
    // emit in the original order: tool_call(t1), tool_call(t2),
    // tool_call(t3), then tool_result(t1), tool_result(t2),
    // tool_result(t3).
    const delays: Record<string, number> = { t1: 50, t2: 30, t3: 10 };
    await runRoundTools({
      roundCalls: [
        { name: "t1", args: {} },
        { name: "t2", args: {} },
        { name: "t3", args: {} },
      ],
      parallelEnabled: true,
      runTool: async (call) => {
        await new Promise((r) => setTimeout(r, delays[call.name ?? ""]));
        return { success: true, data: call.name } as ToolResult;
      },
      enqueue: (evt) => events.push(evt),
    });
    // Tool_call events arrive upfront in original order.
    const callOrder = events
      .filter((e) => e.type === "tool_call")
      .map((e) => e.name);
    expect(callOrder).toEqual(["t1", "t2", "t3"]);
    // Tool_result events also in original order, regardless of when
    // they actually resolved.
    const resultOrder = events
      .filter((e) => e.type === "tool_result")
      .map((e) => e.name);
    expect(resultOrder).toEqual(["t1", "t2", "t3"]);
  });

  it("one tool throws → others complete; the throw becomes a failed ToolResult", async () => {
    const events: SseEvent[] = [];
    const result = await runRoundTools({
      roundCalls: [
        { name: "t1", args: {} },
        { name: "t2-throws", args: {} },
        { name: "t3", args: {} },
      ],
      parallelEnabled: true,
      runTool: async (call) => {
        if (call.name === "t2-throws") {
          throw new Error("boom");
        }
        return { success: true, data: call.name } as ToolResult;
      },
      enqueue: (evt) => events.push(evt),
    });
    expect(result.results).toHaveLength(3);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain("boom");
    expect(result.results[2].success).toBe(true);
  });

  it("'last tile wins': tile resolved out-of-order does not overwrite later tile", async () => {
    // t1's tile resolves last (longest delay) but t1 is FIRST in
    // original order. Last-tile-wins should pick the LAST in
    // original order (t3), regardless of resolution timing.
    const result = await runRoundTools({
      roundCalls: [
        { name: "t1", args: {} },
        { name: "t2", args: {} },
        { name: "t3", args: {} },
      ],
      parallelEnabled: true,
      runTool: async (call) => {
        // t1 resolves slowest, t3 fastest — but iteration is in
        // original order so t3's tile must win.
        const delay = call.name === "t1" ? 50 : call.name === "t2" ? 25 : 5;
        await new Promise((r) => setTimeout(r, delay));
        return {
          success: true,
          tile: tile(call.name ?? ""),
        } as ToolResult;
      },
      enqueue: () => {},
    });
    expect(result.persistedTile).toBeTruthy();
    expect((result.persistedTile?.data as { body: string }).body).toBe("t3");
  });

  it("flag off → sequential execution: start times do NOT overlap", async () => {
    const startTimes: number[] = [];
    await runRoundTools({
      roundCalls: [
        { name: "t1", args: {} },
        { name: "t2", args: {} },
        { name: "t3", args: {} },
      ],
      parallelEnabled: false,
      runTool: async () => {
        startTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 30));
        return { success: true } as ToolResult;
      },
      enqueue: () => {},
    });
    expect(startTimes).toHaveLength(3);
    // Each must start ≥ 25ms after the previous (allowing some slack
    // under busy CI).
    expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(25);
    expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(25);
  });

  it("returns parallelToolsUsed=false when flag is off", async () => {
    const result = await runRoundTools({
      roundCalls: [{ name: "t1", args: {} }],
      parallelEnabled: false,
      runTool: async () => ({ success: true }) as ToolResult,
      enqueue: () => {},
    });
    expect(result.parallelToolsUsed).toBe(false);
  });
});
