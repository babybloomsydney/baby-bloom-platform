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
import {
  generate,
  echoModelParts,
  type GeminiTool,
  type GeminiTurn,
} from "@/lib/ai/gemini-client";
import { buildSystemPrompt, type CurrentSurface } from "@/lib/chat/context";
import {
  updateDailyCost,
  checkDailyLimit,
  type TokenUsage,
} from "@/lib/chat/cost-tracker";
import { collectTools, findToolHandler } from "@/lib/chat/modules/registry";
import type { ToolResult } from "@/lib/chat/modules/types";
import {
  getOrCreateBot,
  getUserChildren,
  getUserRole,
  type BotRecord,
} from "@/lib/chat/bot";

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

  // 7. Save user message (capture surface)
  const { data: savedUser } = await admin
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
    .single();

  // 8. Build system prompt
  const systemPrompt = await buildSystemPrompt({
    botId: bot.id,
    userId: user.id,
    role: bot.role,
    effectiveRole,
    userName:
      (user.user_metadata as { first_name?: string })?.first_name ?? "there",
    children,
    currentSurface: body.currentSurface ?? null,
  });

  // 9. Load recent history (last 20 user+assistant messages)
  const { data: history } = await admin
    .from("chat_messages")
    .select("role, content, metadata")
    .eq("bloombot_id", bot.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(20);

  // Reverse to chronological; exclude the just-saved user message
  const historyRows = (history ?? [])
    .filter((r) => r.content !== body.message)
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

  // 11. Stream response — agentic loop, streams the FINAL text response
  const MAX_TOOL_ROUNDS = 5;
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
        // Agentic loop: keep calling Gemini while it wants to call tools.
        // On the FINAL round (no more tool calls), stream the text response.
        const runningTurns: GeminiTurn[] = [...conversationTurns];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const resp = await generate({
            model,
            systemPrompt,
            contents: runningTurns,
            tools,
          });
          accrueUsage(resp.usageMetadata);

          const roundCalls = resp.functionCalls ?? [];
          const roundText = resp.text ?? "";

          // Always stream whatever text this round produced — even if the
          // model is about to call another tool, there may be narration.
          if (roundText) {
            fullText += roundText;
            controller.enqueue(encodeSSE({ type: "text", content: roundText }));
          }

          if (roundCalls.length === 0) {
            // Done — no more tool calls requested.
            break;
          }

          // Execute tool calls, emit events, build the continuation turn.
          const modelParts = resp.candidates?.[0]?.content?.parts;
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
              encodeSSE({ type: "tool_result", name: call.name, result }),
            );
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

        // Fallback: if the loop produced zero text (shouldn't normally happen
        // but Gemini sometimes falls silent mid-loop), synthesize a minimal
        // acknowledgement from the last tool result.
        if (!fullText.trim()) {
          const last = toolCalls[toolCalls.length - 1];
          const fallbackText = last?.result.error
            ? last.result.error
            : last
              ? `I ran \`${last.name}\` — results are above.`
              : "Sorry — I didn't have anything to say there. Try rephrasing?";
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

  // savedUser reserved for future error-path bookkeeping; suppress unused warning
  void savedUser;

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
