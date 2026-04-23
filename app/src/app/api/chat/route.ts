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
  generateStream,
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
import { getOrCreateBot, getUserChildren, getUserRole } from "@/lib/chat/bot";

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

  let bot;
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

  // 11. Stream response
  const encoder = new TextEncoder();
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

      try {
        // Round 1 — non-streaming to detect tool calls efficiently
        const round1 = await generate({
          model,
          systemPrompt,
          contents: conversationTurns,
          tools,
        });

        const round1Usage = round1.usageMetadata;
        if (round1Usage) {
          totalUsage = {
            inputTokens: round1Usage.promptTokenCount ?? 0,
            outputTokens: round1Usage.candidatesTokenCount ?? 0,
            cachedTokens: round1Usage.cachedContentTokenCount ?? 0,
          };
        }

        const calls = round1.functionCalls ?? [];

        if (calls.length === 0) {
          // No tool calls — emit the text as a single SSE chunk
          const text = round1.text ?? "";
          fullText = text;
          if (text) {
            controller.enqueue(encodeSSE({ type: "text", content: text }));
          }
        } else {
          // Execute each tool call
          for (const call of calls) {
            controller.enqueue(
              encodeSSE({
                type: "tool_call",
                name: call.name,
                args: call.args,
              }),
            );

            const handlerModule = findToolHandler(call.name!, effectiveRole);
            let result: ToolResult;
            if (!handlerModule) {
              result = {
                success: false,
                error: `Unknown tool: ${call.name}`,
              };
            } else {
              try {
                result = await handlerModule.execute(
                  call.name!,
                  (call.args ?? {}) as Record<string, unknown>,
                  {
                    botId: bot.id,
                    userId: user.id,
                    userRole: bot.role,
                    effectiveRole,
                    children,
                    currentSurface: body.currentSurface ?? null,
                    supabase: admin,
                  },
                );
              } catch (err) {
                result = {
                  success: false,
                  error:
                    err instanceof Error
                      ? err.message
                      : "tool execution failed",
                };
              }
            }

            toolCalls.push({ name: call.name!, args: call.args, result });
            controller.enqueue(
              encodeSSE({ type: "tool_result", name: call.name, result }),
            );
          }

          // Round 2 — streaming continuation with tool results.
          // Echo model parts verbatim (preserves thoughtSignature — spike WU 0.6).
          const modelParts = round1.candidates?.[0]?.content?.parts;
          if (modelParts) {
            const continuationTurns: GeminiTurn[] = [
              ...conversationTurns,
              echoModelParts(modelParts),
              {
                role: "user",
                parts: calls.map((call, i) => ({
                  functionResponse: {
                    name: call.name!,
                    response: toolCalls[i]?.result as unknown as Record<
                      string,
                      unknown
                    >,
                  },
                })),
              },
            ];

            const streamResp = await generateStream({
              model,
              systemPrompt,
              contents: continuationTurns,
              tools,
            });

            for await (const chunk of streamResp) {
              if (chunk.text) {
                fullText += chunk.text;
                controller.enqueue(
                  encodeSSE({ type: "text", content: chunk.text }),
                );
              }
              const chunkUsage = chunk.usageMetadata;
              if (chunkUsage) {
                // Keep the latest usage totals — Gemini reports cumulative
                totalUsage = {
                  inputTokens:
                    chunkUsage.promptTokenCount ?? totalUsage.inputTokens,
                  outputTokens:
                    chunkUsage.candidatesTokenCount ?? totalUsage.outputTokens,
                  cachedTokens:
                    chunkUsage.cachedContentTokenCount ??
                    totalUsage.cachedTokens,
                };
              }
            }
          }
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
            user_id: user.id,
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

  // unused but retained to satisfy TS stream setup if the branch above returns
  void encoder;
  void savedUser;
}
