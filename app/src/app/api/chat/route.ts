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
import {
  KATIE_ALWAYS_ON_CONTEXT_ENABLED,
  KATIE_ENABLED,
  KATIE_PARALLEL_TOOLS_ENABLED,
  KATIE_PRELOAD_PASSTHROUGH_ENABLED,
  KATIE_STREAM_DIAGNOSTICS,
} from "@/lib/chat/flags";
import { runRoundTools } from "./run-round-tools";
import { checkPrefulfilled } from "./check-prefulfilled";
import { verifyPreload } from "@/lib/chat/preload/verify";
import { buildAlwaysOnContext } from "@/lib/chat/preload/build-always-on";
import { mergePreloads } from "@/lib/chat/preload/merge";
import type { PreloadedContext } from "@/lib/chat/preload/types";
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
import {
  buildStaticPrompt,
  buildRuntimeContext,
  type CurrentSurface,
} from "@/lib/chat/context";
import { buildMemoryTable } from "@/lib/chat/memory/context-builder";
import { buildDevelopmentalSnapshots } from "@/lib/chat/developmental-snapshot";
import {
  getOrCreateCachedContent,
  evictCacheEntry,
  isStaleCacheError,
} from "@/lib/ai/gemini-cache-manager";
import {
  updateDailyCost,
  checkDailyLimit,
  type TokenUsage,
} from "@/lib/chat/cost-tracker";
import { collectTools, findToolHandler } from "@/lib/chat/modules/registry";
import type { ToolResult } from "@/lib/chat/modules/types";
import { gateChildScopedTool } from "@/lib/chat/access-gate";
import { buildKatieSubscriptionRequiredResult } from "@/lib/chat/subscription-required-reply";
import type { ChatTile } from "@/lib/chat/tiles";
import {
  getOrCreateBot,
  getUserChildren,
  getUserRole,
  type BotRecord,
} from "@/lib/chat/bot";
import { pickFallbackText, safeToolResultForClient } from "./fallback";
import { formatRelativeTime } from "@/lib/chat/relative-time";

// Use Node runtime for streaming + access to private Supabase key
export const runtime = "nodejs";

// ── Helpers ────────────────────────────────────────────────────────────

function encodeSSE(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
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
  // 0. Feature flag — synchronous, can return JSON 404 cleanly
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 1. Parse body — synchronous so the JSON 400 path stays clean.
  // `preload` is optional; verified per-slot at the trust boundary
  // below before being embedded into the runtime context. Invalid
  // shapes drop slots, never reject the request.
  let body: {
    message: string;
    currentSurface?: CurrentSurface | null;
    preload?: PreloadedContext;
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

  // 2. Stream response — EVERYTHING else runs inside start(controller)
  // so the SSE response headers reach the browser immediately. The
  // browser then opens the channel and shows the TypingIndicator
  // while we're still doing auth + DB work + system-prompt build,
  // instead of staring at a blank screen for 5-30 seconds.
  //
  // Inside start(), errors that previously returned NextResponse.json
  // become SSE error+done events. The HTTP status is locked at 200
  // by that point but the client treats `{ type: "error" }` events
  // as failures (see use-chat-stream.ts).
  const MAX_TOOL_ROUNDS = 8;
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();

      function emitError(message: string) {
        controller.enqueue(encodeSSE({ type: "error", message }));
        controller.enqueue(encodeSSE({ type: "done" }));
        controller.close();
      }

      // ── Pre-flight (auth + DB + prompt build) ────────────────────────
      const { user } = await getAuthUser();
      if (!user) {
        emitError("unauthorized");
        return;
      }
      const userId = user.id;

      const role = await getUserRole(userId);
      if (!role) {
        emitError("user has no role");
        return;
      }

      let bot: BotRecord;
      try {
        bot = await getOrCreateBot(userId, role);
      } catch (err) {
        console.error("[api/chat] getOrCreateBot", err);
        emitError("Could not set up your assistant. Try again shortly.");
        return;
      }

      const effectiveRole = resolveEffectiveRole(
        bot.role,
        bot.settings?.effective_role ?? null,
      );
      const model = selectGeminiModel(effectiveRole);

      const limit = await checkDailyLimit(bot.id);
      if (!limit.allowed) {
        emitError(
          "I've hit my daily usage limit. I'll be back tomorrow — in the meantime the site is all still here.",
        );
        return;
      }
      // WU 13.5 — server-side soft warning at 90% of cap. NO user-visible
      // change; just an observability signal so we can see who's
      // approaching the cap before they hit it. The user said
      // "no UX degradation" — degrading the experience at 90% would
      // violate that. The hard cap above is the only point at which
      // service is interrupted.
      if (limit.nearCap) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            event: "katie.cap_warning",
            bot_id: bot.id,
            spent: limit.spent,
            limit: limit.limit,
            remaining: limit.remaining,
          }),
        );
      }

      const children = await getUserChildren(userId, role);
      const admin = createAdminClient();

      // Save user message. Surface insert errors loudly — if the user's
      // turn isn't persisted, conversation history breaks silently for
      // every subsequent turn.
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
        emitError("Sorry — I couldn't save your message. Try again?");
        return;
      }

      // Latency:Efficiency build, WU5 (perf-reviewer HIGH): combine
      // every independent pre-flight read into ONE Promise.allSettled.
      // Previously memoryTable + developmentalSnapshot were sequential
      // awaits, adding ~200-500ms serial overhead. Now they parallelise
      // with the verifier + always-on builder; total wall time = max of
      // all four, not sum.
      //
      // WU 10.4 dev-snapshot fail-open semantics preserved — handled
      // via Promise.allSettled status check below.
      const memoryTablePromise = buildMemoryTable({
        botId: bot.id,
        childIds: children.map((c) => c.id),
        supabase: admin,
      });
      const developmentalSnapshotPromise = buildDevelopmentalSnapshots(
        children,
        admin,
      );

      // Load last 20 messages BEFORE buildSystemPrompt so the
      // gap-aware continuity header gets the most-recent timestamp.
      // Select `id` to exclude the just-saved user message by id
      // (content-based dedup silently drops repeated phrases like
      // "yes"). Select `created_at` so each user turn can be prefixed
      // with a relative timestamp.
      const { data: history } = await admin
        .from("chat_messages")
        .select("id, role, content, metadata, created_at")
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
          created_at: string;
        }>
      )
        .filter((r) => r.id !== justSavedId)
        .reverse();

      const lastInteractionAt =
        historyRows.length > 0
          ? historyRows[historyRows.length - 1].created_at
          : null;

      // WU 13.2 — split prompt into static (cacheable on Gemini) + runtime
      // (per-turn, cannot be cached). The static portion is shared across
      // all users on the same (model, effectiveRole, prompt-version-hash);
      // the runtime portion (header + snapshot + memory) is injected as
      // a synthetic priming turn at position 0 of `contents` when caching
      // is active.
      // Latency:Efficiency build:
      //   WU4 (F2) — verify client-supplied preload (when flagged on).
      //   WU5 (F3) — fetch server-side always-on context.
      //   Plus: memoryTable + developmentalSnapshot pulled into the
      //   same parallel batch (perf-reviewer HIGH on WU5 — these were
      //   serial awaits before, costing 200-500ms of wall time outside
      //   the parallel window).
      //
      // All four legs run in parallel via Promise.allSettled so the
      // slowest bounds wall time, not the sum. Client and server
      // preloads merge per the WU5 merge rule (client wins per-child
      // on array slots; server wins on singletons).
      let clientPreload: PreloadedContext | undefined = undefined;
      let droppedSlots: Array<
        Awaited<ReturnType<typeof verifyPreload>>["dropped"][number]
      > = [];
      let serverAlwaysOn: PreloadedContext | undefined = undefined;
      const [verifyResult, alwaysOnResult, memoryResult, snapshotResult] =
        await Promise.allSettled([
          KATIE_PRELOAD_PASSTHROUGH_ENABLED
            ? verifyPreload({
                preload: body.preload,
                userId,
                role: bot.role,
                childrenScope: children,
                supabase: admin,
              })
            : Promise.resolve({ accepted: undefined, dropped: [] as const }),
          KATIE_ALWAYS_ON_CONTEXT_ENABLED
            ? buildAlwaysOnContext({
                userId,
                botId: bot.id,
                role: bot.role,
                children,
                supabase: admin,
              })
            : Promise.resolve(undefined),
          memoryTablePromise,
          developmentalSnapshotPromise,
        ]);
      // WU 10.4 dev-snapshot fail-open semantics: rejection → null,
      // route continues without the block. Same for memoryTable.
      const memoryTable =
        memoryResult.status === "fulfilled" ? memoryResult.value : null;
      if (memoryResult.status === "rejected") {
        console.error(
          "[api/chat] memoryTable build failed (continuing without it):",
          memoryResult.reason,
        );
      }
      const developmentalSnapshot =
        snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
      if (snapshotResult.status === "rejected") {
        console.error(
          "[api/chat] developmental snapshot failed (continuing without it):",
          snapshotResult.reason,
        );
      }
      if (verifyResult.status === "fulfilled") {
        const v = verifyResult.value;
        // Strip the `VerifiedContext` brand at this layer — BotContext
        // doesn't carry it; the brand is scoped to the verifier.
        clientPreload = (v.accepted as PreloadedContext) ?? undefined;
        droppedSlots = [...v.dropped];
      } else {
        // Verifier never throws by design — but fail-open if it does.
        console.error(
          "[api/chat] verifyPreload threw unexpectedly (continuing without client preload):",
          verifyResult.reason,
        );
      }
      if (alwaysOnResult.status === "fulfilled") {
        serverAlwaysOn = alwaysOnResult.value;
      } else {
        // Always-on builder never throws (per-slot fail-open) but
        // belt-and-braces.
        console.error(
          "[api/chat] buildAlwaysOnContext threw unexpectedly (continuing without server preload):",
          alwaysOnResult.reason,
        );
      }
      const mergedPreload = mergePreloads({
        client: clientPreload,
        server: serverAlwaysOn,
      });
      // Telemetry — slot names that landed in the merged preload.
      const acceptedSlotNames: string[] = mergedPreload
        ? Object.keys(mergedPreload).filter((k) => k !== "as_of")
        : [];
      // Slot names that came from the server (always-on builder).
      // Useful for distinguishing "client passthrough" turns from
      // "always-on" turns in audits.
      const alwaysOnBlockNames: string[] = serverAlwaysOn
        ? Object.keys(serverAlwaysOn).filter((k) => k !== "as_of")
        : [];
      if (droppedSlots.length > 0) {
        console.warn(
          "[api/chat] dropped preload slots:",
          droppedSlots.map((d) => `${d.slot}:${d.reason}`).join(","),
        );
      }

      const ctxForPrompt = {
        botId: bot.id,
        userId,
        role: bot.role,
        effectiveRole,
        userName:
          (user.user_metadata as { first_name?: string })?.first_name ??
          "there",
        children,
        currentSurface: body.currentSurface ?? null,
        memoryTable,
        developmentalSnapshot,
        lastInteractionAt,
        botSettings: bot.settings,
        // WU4 + WU5 — merged preload threads into the runtime context
        // block. Combines verified client passthrough (per-child wins)
        // with server-side always-on data (single-slot wins). Undefined
        // when both legs are empty / flag-off.
        preload: mergedPreload,
      };
      // Per-bot module filtering — pass `bot.settings` to both
      // `buildStaticPrompt` and `collectTools` so a module gated by
      // `enabledForBot` (e.g. `child-onboarding` once
      // `onboarding_completed` flips true) is excluded consistently
      // from BOTH the cached static prompt AND the tools list. `bot`
      // is typed via `BotRecord` whose `settings: BotSettings` already
      // covers the typed fields — no cast needed.
      const { staticPrompt, versionHash } = await buildStaticPrompt({
        effectiveRole,
        role: bot.role,
        botSettings: bot.settings,
      });
      const runtimeContext = buildRuntimeContext(ctxForPrompt);

      // Tools first — needed BOTH for the cache (baked-in) and for the
      // uncached generateStream calls. Gemini rejects requests that set
      // both `cachedContent` and `tools`, so when a cache is in use the
      // tools live inside the cache and we omit them on the call.
      const toolDefs = collectTools(effectiveRole, bot.settings);
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

      // Try to get / create the Gemini cache for this (model, role, hash, tools).
      // Returns null on any failure — the route then falls back to passing
      // the full systemPrompt + tools uncached.
      const cacheName = await getOrCreateCachedContent({
        model,
        effectiveRole,
        versionHash,
        staticSystemInstruction: staticPrompt,
        tools: tools ?? [],
      });

      // Prefix USER turns with `[N min ago] / [yesterday] / etc` so
      // Gemini can reason about how long ago things were said. Assistant
      // turns are NOT timestamped — see WU 8.20.
      const renderTime = new Date();

      // When cached, the runtime context enters via a synthetic priming
      // pair at position 0 of the contents array (Gemini's documented
      // pattern for adding per-call context to a cached systemInstruction).
      // The model turn is exactly "Understood." — no thinking parts, no
      // function parts — so the agentic loop's echoModelParts +
      // thoughtSignature handling can't be confused by it.
      const primingTurns: GeminiTurn[] =
        cacheName !== null
          ? [
              {
                role: "user",
                parts: [{ text: `[context]\n${runtimeContext}` }],
              },
              { role: "model", parts: [{ text: "Understood." }] },
            ]
          : [];

      const conversationTurns: GeminiTurn[] = [
        ...primingTurns,
        ...historyRows.map((r) => ({
          role: r.role === "assistant" ? ("model" as const) : ("user" as const),
          parts: [
            {
              text:
                r.role === "user"
                  ? `[${formatRelativeTime(r.created_at, renderTime)}] ${r.content}`
                  : r.content,
            },
          ],
        })),
        { role: "user", parts: [{ text: `[just now] ${body.message}` }] },
      ];

      // The fallback systemPrompt for the uncached path. When caching is
      // active, this is unused (the cache provides systemInstruction,
      // and runtime is in the priming turns).
      const fallbackSystemPrompt = `${staticPrompt}\n\n${runtimeContext}`;

      // ── Agentic loop (streams to controller) ─────────────────────────
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
      // Tracks whether the parallel-tool path actually fired this
      // turn (true on the first round that used Promise.all). Sticky
      // across rounds — once true for the turn, stays true.
      let parallelToolsUsedThisTurn = false;
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

      // Latency:Efficiency build, WU6 (F4 belt-and-braces) — names of
      // tools whose `isPrefulfilled` predicate fired this turn. The
      // route short-circuits before the handler runs and emits a
      // synthetic ToolResult pointing Katie back at the runtime
      // context block. Persisted to metadata + JSON log so we can
      // measure how often the directive (D-09) is bypassed.
      //
      // Accumulates across rounds; deduplicated at metadata write
      // time. Same tool short-circuited in two rounds counts once.
      const skippedToolNames: string[] = [];

      // WU6 — admin impersonation guard. When effective_role differs
      // from bot.role (admin testing a parent / nanny role via
      // settings.effective_role), the always-on builder ran with
      // bot.role's perspective but the handler dispatches on
      // effectiveRole. Pre-fulfilled short-circuits would surface
      // wrong-role data via the synthetic "see runtime context"
      // hint (code-reviewer MEDIUM-2 on WU6). Skip the optimization
      // entirely — admin sessions are rare; correctness trumps the
      // saved DB hit.
      const prefulfilledSafe = bot.role === effectiveRole;

      /** Executes a single function call via module registry. */
      async function runTool(call: {
        name?: string;
        args?: unknown;
      }): Promise<ToolResult> {
        const handlerModule = findToolHandler(
          call.name!,
          effectiveRole,
          bot.settings,
        );
        if (!handlerModule) {
          return { success: false, error: `Unknown tool: ${call.name}` };
        }
        const args = (call.args ?? {}) as Record<string, unknown>;
        // WU6 — pre-fulfilled short-circuit. If the tool's predicate
        // fires, skip the handler + emit a synthetic "see runtime
        // context" result. The `tool_call` SSE event still fires
        // upstream in `run-round-tools.ts` so Katie sees what she
        // asked for.
        //
        // Wrapped in try/catch — a buggy predicate (e.g. throwing on
        // unexpected preload shape) MUST fail-open to running the
        // real handler, not abort the turn. silent-failure-hunter
        // HIGH-1 on WU6.
        if (prefulfilledSafe) {
          const tool = handlerModule.tools.find((t) => t.name === call.name);
          let outcome: ReturnType<typeof checkPrefulfilled>;
          try {
            outcome = checkPrefulfilled(tool, args, mergedPreload);
          } catch (err) {
            console.error(
              "[api/chat] isPrefulfilled threw; falling through to handler:",
              { tool: call.name, err },
            );
            outcome = { skip: false };
          }
          if (outcome.skip) {
            if (typeof call.name === "string") {
              skippedToolNames.push(call.name);
            }
            return outcome.result;
          }
        }
        // S6 — paywall gate for child-scoped tools. If the resolved
        // child's family lacks access, return a templated subscription_
        // required ToolResult (terminal: true) BEFORE the handler runs.
        // The existing terminal-result handler downstream will surface
        // the message + break the agentic loop.
        if (handlerModule.childScoped) {
          const gate = await gateChildScopedTool(args, children, admin);
          if (gate.kind === "blocked") {
            return buildKatieSubscriptionRequiredResult(
              effectiveRole,
              gate.childFirstName,
              gate.parentFirstName,
            );
          }
          if (gate.kind === "unresolvable") {
            // Forward the resolveChild-style error verbatim — Katie's
            // UX is consistent with the pre-gate behaviour.
            return gate.result;
          }
          // 'ok' or 'no_child_arg' → fall through to the handler.
        }
        try {
          return await handlerModule.execute(call.name!, args, {
            botId: bot.id,
            userId,
            userRole: bot.role,
            effectiveRole,
            children,
            currentSurface: body.currentSurface ?? null,
            supabase: admin,
            // WU6 — modules that want to enrich responses can read
            // the merged preload directly (e.g. a future write tool
            // that pre-validates against pre-loaded child profiles).
            preload: mergedPreload,
          });
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

        // Track whether the cached path is still viable across rounds.
        // If a stale-cache error is detected mid-loop, we evict +
        // re-run with the full systemPrompt for the rest of the turn.
        let useCacheForThisTurn = cacheName !== null;
        let primingDropped = false;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          // WU 13.2 — cached vs uncached call shape:
          //   cached:    cachedContent set, NO systemPrompt, NO tools (both baked into cache),
          //              runtime in priming turns
          //   uncached:  systemPrompt set + tools passed inline, NO cachedContent
          //
          // Real-soak fix 2026-05-06: previously `tools` was passed on
          // every call. Gemini rejects that combo with:
          //   "CachedContent can not be used with GenerateContent request
          //    setting system_instruction, tools or tool_config."
          // Tools now live inside the cache (see gemini-cache-manager).
          let stream;
          try {
            stream = await generateStream({
              model,
              ...(useCacheForThisTurn
                ? { cachedContent: cacheName! }
                : { systemPrompt: fallbackSystemPrompt, tools }),
              contents: runningTurns,
            });
          } catch (err) {
            // Stale cache (TTL expired between create and use)? Evict +
            // retry once uncached. The user never sees a break.
            //
            // Round-safety: a stale-cache error can only originate from
            // the *first* generateStream call of a turn, because the
            // cache is consulted up front (getOrCreateCachedContent at
            // turn start). After round 0 succeeds, the model has already
            // committed to the cached prompt for the rest of the turn —
            // mid-loop expiry would require an hour to elapse between
            // tool rounds, which is impossible at typical agentic-loop
            // wall-times (seconds). The splice below assumes priming
            // turns are still at the head of runningTurns; this assumption
            // would only break if Gemini's stale-cache semantics change
            // in a future SDK to fire mid-stream.
            if (useCacheForThisTurn && isStaleCacheError(err)) {
              evictCacheEntry({
                model,
                effectiveRole,
                versionHash,
                tools: tools ?? [],
              });
              useCacheForThisTurn = false;
              // Drop the priming turns — they're redundant when systemPrompt
              // is back to carrying the runtime context.
              if (!primingDropped) {
                runningTurns.splice(0, primingTurns.length);
                primingDropped = true;
              }
              stream = await generateStream({
                model,
                systemPrompt: fallbackSystemPrompt,
                contents: runningTurns,
                tools,
              });
            } else {
              throw err;
            }
          }

          // Narrow `stream` from `Awaited<...> | undefined` to defined.
          // Either the try set it, or the catch's stale-cache branch did,
          // or the catch re-threw (handled by outer try). A future
          // refactor that adds a fourth branch must keep this invariant.
          if (stream === undefined) {
            throw new Error(
              "[api/chat] stream not assigned after generateStream try/catch — unreachable",
            );
          }

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
              if (KATIE_STREAM_DIAGNOSTICS) {
                // V1.1 side fix 2 diagnostic instrumentation. Logs
                // each SSE text chunk's wall-clock timestamp + delta
                // length. Compare against the client-side line in
                // use-chat-stream.ts to attribute "3 dots → block"
                // to Gemini chunking vs HTTP buffering vs React
                // batching. NEVER leave on in production — one line
                // per token is loud.
                console.log(
                  `[stream-diag][server] t=${Date.now()} len=${delta.length} preview=${JSON.stringify(delta.slice(0, 24))}`,
                );
              }
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

          // Latency:Efficiency build, WU3 (F1) — parallel tool execution
          // within a round, gated by KATIE_PARALLEL_TOOLS_ENABLED. Helper
          // preserves SSE event order + "last tile wins" semantics.
          // The discriminated `RoundEvent` union narrows cleanly on
          // `evt.type` so no unsafe casts are needed in this adapter.
          // `safeToolResultForClient` is applied at the emission
          // boundary so the raw result stays available for the
          // continuation turn while client events stay sanitized.
          const roundOutcome = await runRoundTools({
            roundCalls: roundCalls.map((c) => ({ name: c.name, args: c.args })),
            parallelEnabled: KATIE_PARALLEL_TOOLS_ENABLED,
            runTool,
            enqueue: (evt) => {
              if (evt.type === "tool_result") {
                controller.enqueue(
                  encodeSSE({
                    type: "tool_result",
                    name: evt.name,
                    result: safeToolResultForClient(evt.result),
                  }),
                );
              } else {
                controller.enqueue(encodeSSE(evt));
              }
            },
          });
          const roundResults: ToolResult[] = roundOutcome.results;
          for (let i = 0; i < roundCalls.length; i++) {
            const call = roundCalls[i];
            // Defensive: guard the name fall-through. Gemini's
            // type allows function calls without a name (rare/never
            // in practice). Pushing `undefined` would corrupt the
            // toolCalls accumulator that feeds metadata + the
            // continuation turn's functionResponse mapping below.
            if (typeof call.name !== "string") continue;
            toolCalls.push({
              name: call.name,
              args: call.args,
              result: roundResults[i],
            });
          }
          if (roundOutcome.persistedTile) {
            persistedTile = roundOutcome.persistedTile;
          }
          parallelToolsUsedThisTurn =
            parallelToolsUsedThisTurn || roundOutcome.parallelToolsUsed;

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
            // WU 13.2 — cache observability. cache_hit signals whether the
            // turn used a Gemini cachedContent. prompt_version_hash lets
            // future analyses correlate prompt edits with behaviour
            // changes.
            cache_hit: cacheName !== null && useCacheForThisTurn,
            cache_name: cacheName,
            prompt_version_hash: versionHash,
            // Latency:Efficiency build, WU3 (F1) — true when the
            // parallel-tools path executed at least once this turn.
            parallel_tools_used: parallelToolsUsedThisTurn,
            // WU4 (F2) — preload telemetry. `received` lists slot
            // names that survived verification; `rejected` lists
            // dropped slots with their reasons. We deliberately
            // STRIP the per-entry `child_id` field from rejected
            // entries before persisting — a child UUID the user
            // does NOT own should not be persisted to a row owned
            // by them (low-sensitivity PII pattern). Drop reasons
            // + slot names are sufficient for telemetry attribution.
            preload_slots_received: acceptedSlotNames,
            preload_slots_rejected: droppedSlots.map((d) => ({
              slot: d.slot,
              reason: d.reason,
            })),
            // WU5 (F3) — slot names populated by the server-side
            // always-on builder (subset of `preload_slots_received`).
            // Distinguishes always-on turns from client-only turns
            // for audit attribution.
            always_on_blocks: alwaysOnBlockNames,
            // WU6 (F4 belt-and-braces) — tool names short-circuited
            // by `isPrefulfilled` this turn. Deduplicated — same
            // tool fired twice across rounds counts once. Empty
            // array = Katie either didn't call any read tools, or
            // called tools whose data wasn't in pre-load.
            tool_calls_skipped_by_prefulfilled: Array.from(
              new Set(skippedToolNames),
            ),
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
            cache_hit: cacheName !== null && useCacheForThisTurn,
            prompt_version_hash: versionHash,
            parallel_tools_used: parallelToolsUsedThisTurn,
            preload_slots_received: acceptedSlotNames,
            // Asymmetric with `metadata.preload_slots_rejected` (full
            // array) by design — JSON log feeds dashboards that count
            // rejection rates; the metadata column is the canonical
            // per-row record for audits.
            preload_slots_rejected_count: droppedSlots.length,
            always_on_blocks: alwaysOnBlockNames,
            // WU6 — count + names. Names are deduplicated (same
            // tool short-circuited twice across rounds counts once).
            // Names are short and bounded (max ~8 read tools);
            // persisting both gives audits a per-row picture without
            // a join.
            tool_calls_skipped_by_prefulfilled_count: new Set(skippedToolNames)
              .size,
            tool_calls_skipped_by_prefulfilled: Array.from(
              new Set(skippedToolNames),
            ),
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
        // Always emit a `done` event on the error path so the client's
        // stream reader transitions out of `isStreaming = true`. Without
        // this, an unexpected exception in the agentic loop leaves the
        // input disabled forever even though the channel has closed.
        controller.enqueue(encodeSSE({ type: "done" }));
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
