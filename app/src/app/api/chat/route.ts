/**
 * POST /api/chat — Katie's main chat endpoint.
 *
 * Returns a text/event-stream SSE response with chunks:
 *   data: {"type":"text","content":"..."}
 *   data: {"type":"tool_call","name":"...","args":{...}}
 *   data: {"type":"tool_result","name":"...","result":{...}}
 *   data: {"type":"done","metadata":{...}}
 *
 * Flow:
 *   1. KATIE_ENABLED gate (404 if off)
 *   2. Auth via cookie → get user
 *   3. Lazy-create bot (one per user)
 *   4. Load user's children + build ModuleContext
 *   5. Save user message
 *   6. Daily cost cap check
 *   7. Build system prompt (from katie_prompt table)
 *   8. Load last 20 messages for history
 *   9. First round (non-streaming): Gemini call with tools
 *   10. If tool calls → execute handlers, then streaming continuation
 *   11. Save assistant reply + update cost
 *
 * See system/APP/BLOOMBOT/ARCHITECTURE.md "Chat API Route" section.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";
import {
  selectGeminiModel,
  resolveEffectiveRole,
} from "@/lib/ai/model-selector";
import type { GenerateContentResponse, FunctionCall } from "@google/genai";
import {
  generateStream,
  echoModelParts,
  type GeminiTool,
  type GeminiTurn,
} from "@/lib/ai/gemini-client";
import { buildSystemPrompt, type CurrentSurface } from "@/lib/chat/context";
import { buildMemoryTable } from "@/lib/chat/memory/context-builder";
import {
  updateDailyCost,
  checkDailyLimit,
  type TokenUsage,
} from "@/lib/chat/cost-tracker";
import { collectTools, findToolHandler } from "@/lib/chat/modules/registry";
import type { ToolResult } from "@/lib/chat/modules/types";
import { isChatTile, type ChatTile } from "@/lib/chat/tiles";
import {
  getOrCreateBot,
  getUserChildren,
  getUserRole,
  type BotRecord,
} from "@/lib/chat/bot";
import { pickFallbackText, safeToolResultForClient } from "./fallback";

// Use Node runtime for streaming + access to private Supabase key
export const runtime = "nodejs";

// ── Helpers ────────────────────────────────────────────────────────────

function encodeSSE(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function errorSSE(message: string, status = 500): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encodeSSE({ type: "error", message }));
      controller.enqueue(encodeSSE({ type: "done" }));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function getAuthUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user };
}

// ── Route handler ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 0. Feature flag
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 1. Auth
  const { user } = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: {
    message: string;
    currentSurface?: CurrentSurface | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "message is required (string)" },
      { status: 400 },
    );
  }

  // 3. Resolve role + bot
  const role = await getUserRole(user.id);
  if (!role) {
    return NextResponse.json({ error: "user has no role" }, { status: 403 });
  }

  let bot: BotRecord;
  try {
    bot = await getOrCreateBot(user.id, role);
  } catch (err) {
    console.error("[api/chat] getOrCreateBot", err);
    return errorSSE("Could not set up your assistant. Try again shortly.");
  }

  // 4. Effective role (for Option C admin cross-role simulation)
  const effectiveRole = resolveEffectiveRole(
    bot.role,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bot.settings as any)?.effective_role ?? null,
  );
  const model = selectGeminiModel(effectiveRole);

  // 5. Cost cap
  const limit = await checkDailyLimit(bot.id);
  if (!limit.allowed) {
    return errorSSE(
      "I've hit my daily usage limit. I'll be back tomorrow — in the meantime the site is all still here.",
    );
  }

  // 6. Children + module context
  const children = await getUserChildren(user.id);
  const admin = createAdminClient();

  // 7. Save user message (capture surface). Surface insert errors loudly —
  // if the user's turn isn't persisted, conversation history breaks
  // silently for every subsequent turn. We'd rather the user see "try
  // again" now than silently lose half a conversation.
  const { data: savedUser, error: savedUserErr } = await admin
    .from("chat_messages")
    .insert({
      bloombot_id: bot.id,
      role: "user",
      content: body.message,
      trigger_source: "user",
      is_read: true,
      surface_route: body.currentSurface?.route ?? null,
      surface_feature: body.currentSurface?.feature ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (savedUserErr || !savedUser) {
    console.error("[api/chat] failed to save user message", savedUserErr);
    return errorSSE("Sorry — I couldn't save your message. Try again?");
  }

  // 8. Build memory section (pre-rendered for inclusion in system prompt)
  const memoryTable = await buildMemoryTable({
    botId: bot.id,
    childIds: children.map((c) => c.id),
    supabase: admin,
  });

  // 9. Build system prompt
  const systemPrompt = await buildSystemPrompt({
    botId: bot.id,
    userId: user.id,
    role: bot.role,
    effectiveRole,
    userName:
      (user.user_metadata as { first_name?: string })?.first_name ?? "there",
    children,
    currentSurface: body.currentSurface ?? null,
    memoryTable,
  });

  // 9. Load recent history (last 20 user+assistant messages).
  // Select id so we can exclude the just-saved user message by id rather
  // than content — a content-based filter silently drops every prior
  // message with the same text, corrupting context when users send
  // short repeated phrases like "yes" or "ok" across turns.
  const { data: history } = await admin
    .from("chat_messages")
    .select("id, role, content, metadata")
    .eq("bloombot_id", bot.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(20);

  const justSavedId = savedUser.id;
  const historyRows = (
    (history ?? []) as Array<{
      id: string;
      role: string;
      content: string;
      metadata: unknown;
    }>
  )
    .filter((r) => r.id !== justSavedId)
    .reverse();

  const conversationTurns: GeminiTurn[] = [
    ...historyRows.map((r) => ({
      role: r.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: r.content }],
    })),
    { role: "user", parts: [{ text: body.message }] },
  ];

  // 10. Tools
  const toolDefs = collectTools(effectiveRole);
  const tools: GeminiTool[] | undefined =
    toolDefs.length > 0
      ? [
          {
            functionDeclarations: toolDefs.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

  // 11. Stream response — agentic loop, streams the FINAL text response.
  // 8 rounds rather than 5: exploratory chains where the user asks
  // about an entity Katie isn't sure about (e.g. "tell me about Obie"
  // when Obie isn't connected to the account) can take 6-7 calls to
  // exhaust the relevant read tools before Gemini synthesises the
  // "I don't see this entity" answer. 5 was hitting the cap silently.
  const MAX_TOOL_ROUNDS = 8;
  // Narrow non-null references once before the async closure.
  const userId = user.id;
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      const toolCalls: Array<{
        name: string;
        args: unknown;
        result: ToolResult;
      }> = [];
      let fullText = "";
      // Last tile wins — if multiple tool calls in the same turn each
      // return a tile, we render + persist the most recent. Earlier
      // tiles are still streamed to the client via tile events for
      // visibility.
      let persistedTile: ChatTile | null = null;
      let totalUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
      };

      /** Accumulates usage from a single Gemini response's usageMetadata. */
      function accrueUsage(
        usage:
          | {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
              cachedContentTokenCount?: number;
            }
          | undefined,
      ) {
        if (!usage) return;
        totalUsage = {
          inputTokens: totalUsage.inputTokens + (usage.promptTokenCount ?? 0),
          outputTokens:
            totalUsage.outputTokens + (usage.candidatesTokenCount ?? 0),
          cachedTokens:
            totalUsage.cachedTokens + (usage.cachedContentTokenCount ?? 0),
        };
      }

      /** Executes a single function call via module registry. */
      async function runTool(call: {
        name?: string;
        args?: unknown;
      }): Promise<ToolResult> {
        const handlerModule = findToolHandler(call.name!, effectiveRole);
        if (!handlerModule) {
          return { success: false, error: `Unknown tool: ${call.name}` };
        }
        try {
          return await handlerModule.execute(
            call.name!,
            (call.args ?? {}) as Record<string, unknown>,
            {
              botId: bot.id,
              userId,
              userRole: bot.role,
              effectiveRole,
              children,
              currentSurface: body.currentSurface ?? null,
              supabase: admin,
            },
          );
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "tool execution failed",
          };
        }
      }

      try {
        // Agentic loop with streaming. Each round opens a Gemini stream,
        // emits text deltas to SSE as they arrive (so the user sees
        // typewriter behaviour, not a per-round chunk drop), buffers
        // any function calls until end-of-stream, then either dispatches
        // tools + continues OR breaks if the model converged to text.
        const runningTurns: GeminiTurn[] = [...conversationTurns];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const stream = await generateStream({
            model,
            systemPrompt,
            contents: runningTurns,
            tools,
          });

          let roundText = "";
          // Use the SDK's FunctionCall type so the `id` and other fields
          // round-trip through to the continuation turn — needed when
          // Gemini correlates functionResponse parts back to the call.
          const roundCalls: FunctionCall[] = [];
          // Track the last chunk so we can pull usageMetadata +
          // candidates[0].content.parts (for echoModelParts) at the
          // end of the stream — those fields are typically aggregated
          // on the final chunk.
          let lastChunk: GenerateContentResponse | undefined = undefined;

          for await (const chunk of stream) {
            // Text delta — stream straight through to SSE so the client
            // sees char-by-char (or token-by-token) typewriter UX.
            //
            // SDK semantics: `chunk.text` is the concatenation of all
            // text parts within THIS chunk's candidate. Across chunks
            // it behaves as a delta because each chunk is a fresh
            // GenerateContentResponse with only that chunk's wire
            // bytes — there is no cross-chunk aggregation. Within a
            // single chunk, multiple text parts (rare; happens when
            // thoughts and text are interleaved on the same wire
            // chunk) are concatenated. That's harmless cosmetically
            // but worth knowing if tokens ever arrive doubled.
            const delta = chunk.text;
            if (typeof delta === "string" && delta.length > 0) {
              roundText += delta;
              controller.enqueue(encodeSSE({ type: "text", content: delta }));
            }
            // Function calls can arrive in any chunk; accumulate them.
            // Most often Gemini batches them into the final chunk before
            // the stream closes, but we tolerate either pattern.
            const calls = chunk.functionCalls ?? [];
            if (calls.length > 0) {
              roundCalls.push(...calls);
            }
            lastChunk = chunk;
          }

          // Accrue usage from the final chunk only (avoids double-count;
          // intermediate chunks don't have authoritative totals).
          accrueUsage(lastChunk?.usageMetadata);
          fullText += roundText;

          if (roundCalls.length === 0) {
            // Model converged to text — done.
            break;
          }

          // Execute tool calls, emit events, build the continuation turn.
          const modelParts = lastChunk?.candidates?.[0]?.content?.parts;
          if (!modelParts) break; // defensive — shouldn't happen with tool calls

          const roundResults: ToolResult[] = [];
          for (const call of roundCalls) {
            controller.enqueue(
              encodeSSE({
                type: "tool_call",
                name: call.name,
                args: call.args,
              }),
            );
            const result = await runTool(call);
            roundResults.push(result);
            toolCalls.push({ name: call.name!, args: call.args, result });
            controller.enqueue(
              encodeSSE({
                type: "tool_result",
                name: call.name,
                result: safeToolResultForClient(result),
              }),
            );
            // If the tool attached an inline tile, stream it and remember
            // the latest one for persistence with the assistant message.
            if (result.tile && isChatTile(result.tile)) {
              persistedTile = result.tile;
              controller.enqueue(
                encodeSSE({ type: "tile", tile: result.tile }),
              );
            }
          }

          // Terminal short-circuit. If any tool in this round returned
          // `terminal: true`, the answer is already known — no need to
          // burn more rounds (or risk Gemini retrying with different
          // args). Surface the terminal error message directly as the
          // assistant text and break the loop.
          //
          // Why early-emit here rather than letting Gemini synthesise:
          // the terminal error is already user-facing (resolveChild's
          // contract) and another Gemini round costs tokens + latency
          // for no information gain. The model does not see the
          // `terminal` flag itself — only the human-readable error
          // text via the functionResponse — so leaving it to synthesis
          // would be a coin-flip on whether it echoes vs retries.
          const terminalResult = roundResults.find((r) => r.terminal === true);
          if (terminalResult) {
            const text =
              terminalResult.error ??
              "I have everything I need — try asking again?";
            fullText += text;
            controller.enqueue(encodeSSE({ type: "text", content: text }));
            break;
          }

          // Append model turn (echo parts verbatim to preserve thoughtSignature)
          // + user turn with functionResponses to runningTurns.
          runningTurns.push(echoModelParts(modelParts));
          runningTurns.push({
            role: "user",
            parts: roundCalls.map((call, i) => ({
              functionResponse: {
                name: call.name!,
                response: roundResults[i] as unknown as Record<string, unknown>,
              },
            })),
          });

          // Continue loop → call Gemini again with tool results.
        }

        // Fallback: if the loop produced zero text (shouldn't normally
        // happen but Gemini sometimes falls silent mid-loop), synthesize
        // a Katie-voice acknowledgement. NEVER leak tool names or
        // mechanism details — those are backend concerns the user
        // doesn't see and shouldn't be told about.
        if (!fullText.trim()) {
          const last = toolCalls[toolCalls.length - 1];
          const fallbackText = pickFallbackText(last);
          fullText = fallbackText;
          controller.enqueue(
            encodeSSE({ type: "text", content: fallbackText }),
          );
        }

        // Persist assistant message
        const cost = await updateDailyCost(
          bot.id,
          model,
          totalUsage,
          "reactive",
        );
        await admin.from("chat_messages").insert({
          bloombot_id: bot.id,
          role: "assistant",
          content: fullText,
          trigger_source: "assistant_reply",
          is_read: true,
          surface_route: body.currentSurface?.route ?? null,
          surface_feature: body.currentSurface?.feature ?? null,
          tile: persistedTile,
          metadata: {
            model,
            input_tokens: totalUsage.inputTokens,
            output_tokens: totalUsage.outputTokens,
            cached_tokens: totalUsage.cachedTokens,
            cost_usd: cost,
            tool_calls: toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.args,
              success: tc.result.success,
            })),
            duration_ms: Date.now() - startedAt,
          },
        });

        // Structured JSON log for observability (Phase 5 dashboards feed on this)
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "katie.turn",
            bot_id: bot.id,
            user_id: userId,
            model,
            tokens_in: totalUsage.inputTokens,
            tokens_out: totalUsage.outputTokens,
            tokens_cached: totalUsage.cachedTokens,
            cost_usd: cost,
            tool_calls: toolCalls.length,
            duration_ms: Date.now() - startedAt,
            surface: body.currentSurface?.route ?? null,
          }),
        );

        controller.enqueue(encodeSSE({ type: "done", cost_usd: cost }));
      } catch (err) {
        console.error("[api/chat] stream error", err);
        controller.enqueue(
          encodeSSE({
            type: "error",
            message:
              err instanceof Error ? err.message : "Something went wrong.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
