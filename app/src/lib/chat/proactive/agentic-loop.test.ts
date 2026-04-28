/**
 * Tests for runScheduledAgenticLoop — the cron-fire variant of the chat
 * route's tool-calling loop. Generates text, dispatches tool calls,
 * captures tiles, accrues token usage. Smaller than the chat route's
 * loop (no SSE streaming, lower max rounds) but mirrors the same
 * functionResponse + echoModelParts protocol so Gemini 3 doesn't 400
 * on round-trips.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolResult } from "@/lib/chat/modules/types";

const state = vi.hoisted(() => ({
  generateMock: vi.fn(),
}));

vi.mock("@/lib/ai/gemini-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/gemini-client")>(
    "@/lib/ai/gemini-client",
  );
  return {
    ...actual,
    generate: (...args: unknown[]) => state.generateMock(...args),
  };
});

import { runScheduledAgenticLoop } from "./agentic-loop";

beforeEach(() => {
  state.generateMock.mockReset();
});

function geminiTextResponse(text: string, usage = { in: 100, out: 50 }) {
  return Promise.resolve({
    text,
    functionCalls: [],
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: {
      promptTokenCount: usage.in,
      candidatesTokenCount: usage.out,
    },
  });
}

function geminiToolCallResponse(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  usage = { in: 120, out: 30 },
) {
  return Promise.resolve({
    text: "",
    functionCalls: calls,
    candidates: [
      {
        content: {
          parts: calls.map((c) => ({
            functionCall: { name: c.name, args: c.args },
          })),
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: usage.in,
      candidatesTokenCount: usage.out,
    },
  });
}

describe("runScheduledAgenticLoop — text-only path", () => {
  it("returns the generated text and accrues usage when no tool calls fire", async () => {
    state.generateMock.mockReturnValueOnce(
      geminiTextResponse("Oliver had a great week."),
    );

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "you are katie",
      initialPromptText: "Write Oliver's weekly overview.",
      tools: undefined,
      runTool: async () => ({ success: true }),
    });

    expect(result.fullText).toBe("Oliver had a great week.");
    expect(result.lastTile).toBeNull();
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(state.generateMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty text when Gemini returns nothing — caller decides on a fallback", async () => {
    state.generateMock.mockReturnValueOnce(geminiTextResponse(""));

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "you are katie",
      initialPromptText: "Generate.",
      tools: undefined,
      runTool: async () => ({ success: true }),
    });

    expect(result.fullText).toBe("");
  });
});

describe("runScheduledAgenticLoop — tool-call path", () => {
  it("dispatches tool calls + continues the loop with functionResponse turns", async () => {
    state.generateMock
      .mockReturnValueOnce(
        geminiToolCallResponse([
          { name: "create_tile", args: { title: "Weekly", body: "..." } },
        ]),
      )
      .mockReturnValueOnce(
        geminiTextResponse("Tile saved. Quick recap: great week."),
      );

    const runTool = vi.fn(async (call: { name?: string }) => ({
      success: true,
      tile: {
        kind: "katie_note",
        data: { title: "Weekly", body: "Oliver had a great week." },
      },
      data: { log_id: "log-1", tool: call.name },
    })) as unknown as (call: {
      name?: string;
      args?: unknown;
    }) => Promise<ToolResult>;

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "you are katie",
      initialPromptText: "Run the weekly overview.",
      tools: [{ functionDeclarations: [] }],
      runTool,
    });

    expect(result.fullText).toBe("Tile saved. Quick recap: great week.");
    expect(result.lastTile).not.toBeNull();
    expect(result.lastTile?.kind).toBe("katie_note");
    expect(state.generateMock).toHaveBeenCalledTimes(2);
    expect(runTool).toHaveBeenCalledTimes(1);
  });

  it("captures the LAST tile when multiple tool calls each return a tile", async () => {
    state.generateMock
      .mockReturnValueOnce(
        geminiToolCallResponse([
          { name: "create_tile", args: { title: "First", body: "..." } },
          { name: "create_tile", args: { title: "Second", body: "..." } },
        ]),
      )
      .mockReturnValueOnce(geminiTextResponse("Done."));

    let counter = 0;
    const runTool = vi.fn(async () => {
      counter += 1;
      return {
        success: true,
        tile: {
          kind: "katie_note",
          data: {
            title: counter === 1 ? "First" : "Second",
            body: "body text",
          },
        },
      };
    }) as unknown as (call: {
      name?: string;
      args?: unknown;
    }) => Promise<ToolResult>;

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "x",
      initialPromptText: "x",
      tools: [{ functionDeclarations: [] }],
      runTool,
    });

    expect(result.lastTile).not.toBeNull();
    if (result.lastTile?.kind === "katie_note") {
      expect(result.lastTile.data.title).toBe("Second");
    }
  });

  it("captures a runTool exception and feeds it back as a failed function response", async () => {
    state.generateMock
      .mockReturnValueOnce(
        geminiToolCallResponse([
          { name: "create_tile", args: { title: "X", body: "y" } },
        ]),
      )
      .mockReturnValueOnce(geminiTextResponse("Sorry, that failed."));

    const runTool = vi.fn(async () => {
      throw new Error("DB down");
    }) as unknown as (call: {
      name?: string;
      args?: unknown;
    }) => Promise<ToolResult>;

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "x",
      initialPromptText: "x",
      tools: [{ functionDeclarations: [] }],
      runTool,
    });

    expect(result.fullText).toBe("Sorry, that failed.");
    // Two rounds: tool-call attempt + recovery message.
    expect(state.generateMock).toHaveBeenCalledTimes(2);
  });

  it("respects maxRounds — bails out after the cap even if model keeps calling tools", async () => {
    // Always call a tool — model never converges to text.
    state.generateMock.mockImplementation(() =>
      geminiToolCallResponse([{ name: "read_recent_feed", args: {} }]),
    );

    const runTool = (async () => ({ success: true })) as unknown as (call: {
      name?: string;
      args?: unknown;
    }) => Promise<ToolResult>;

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "x",
      initialPromptText: "x",
      tools: [{ functionDeclarations: [] }],
      runTool,
      maxRounds: 2,
    });

    expect(state.generateMock).toHaveBeenCalledTimes(2);
    expect(result.fullText).toBe("");
  });
});

describe("runScheduledAgenticLoop — usage accrual", () => {
  it("sums input + output tokens across rounds", async () => {
    state.generateMock
      .mockReturnValueOnce(
        geminiToolCallResponse([{ name: "x", args: {} }], { in: 100, out: 20 }),
      )
      .mockReturnValueOnce(geminiTextResponse("done", { in: 150, out: 30 }));

    const runTool = (async () => ({ success: true })) as unknown as (call: {
      name?: string;
      args?: unknown;
    }) => Promise<ToolResult>;

    const result = await runScheduledAgenticLoop({
      model: "gemini-3-flash-preview",
      systemPrompt: "x",
      initialPromptText: "x",
      tools: [{ functionDeclarations: [] }],
      runTool,
    });

    expect(result.usage.inputTokens).toBe(250);
    expect(result.usage.outputTokens).toBe(50);
  });
});
