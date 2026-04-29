/**
 * BloomBot module system types.
 *
 * Every capability Katie has (reading child data, logging diary entries,
 * planning activities, creating custom tiles, etc.) is packaged as a
 * self-contained module. See system/APP/BLOOMBOT/MODULES.md for the
 * full philosophy and interface spec.
 */

import type { BotRole } from "@/lib/ai/model-selector";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentSurface, ChildSummary } from "@/lib/chat/context";
import type { ChatTile } from "@/lib/chat/tiles";

// ── Tool schemas (Gemini function-calling format) ──────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** true if this call created a visible feed entry (bapp_logs row) */
  feedEntry?: boolean;
  /** optional user-facing message to render directly (bypasses AI) */
  userMessage?: string;
  /**
   * Optional tile to render inline in the chat surface. Discriminated
   * union — see @/lib/chat/tiles. Gets emitted on the SSE stream and
   * persisted on `chat_messages.tile` so it re-renders on scrollback.
   */
  tile?: ChatTile;
  /**
   * True when this result is conclusive and the agentic loop should
   * stop calling more tools. Set by tool handlers when retrying with
   * a different argument (e.g. another child name) cannot help — the
   * answer is already known from this single call.
   *
   * Route handler treats `terminal: true` as: surface `error` (or a
   * derivation of `data`) to the user as the assistant reply and
   * break the loop. Cleaner than an in-band string marker because
   * it's structural and stripped before the SSE payload reaches the
   * client (see `safeToolResultForClient`).
   */
  terminal?: boolean;
}

// ── Module execution context ──────────────────────────────────────────────

export interface ModuleContext {
  botId: string;
  userId: string;
  /** The bot's stored role (from bloombot.role) */
  userRole: BotRole;
  /** Effective role after resolving bloombot.settings.effective_role (Option C) */
  effectiveRole: BotRole;
  /** All children the user has access to (via user_has_child_access at fetch time) */
  children: ChildSummary[];
  /** What page/feature the user is currently on. May be null. */
  currentSurface?: CurrentSurface | null;
  /** Service-role Supabase client for RLS-bypass cross-table queries. */
  supabase: SupabaseClient;
}

// ── Proactive triggers (declared by modules, fired by dispatcher in Phase 2) ──

export interface SiteEvent {
  source: "event" | "cron" | "manual";
  schedule_id?: string;
  payload: Record<string, unknown>;
}

export interface ProactiveTrigger {
  id: string;
  description: string;
  /** For action-triggered: the server event name that fires this */
  event?: string;
  mode: "template" | "ai-minimal" | "ai-full";
  template?: string;
  promptFragment?: string;
  resolvePayload: (
    event: SiteEvent,
    ctx: ModuleContext,
  ) => Promise<Record<string, unknown>>;
  condition?: (event: SiteEvent, ctx: ModuleContext) => Promise<boolean>;
  fallbackTemplate?: string;
}

// ── Scripted flows (zero-cost reactive conversation trees — Phase 5 deferred) ──

export interface ScriptedFlow {
  id: string;
  triggers: RegExp[];
  // Steps + handler shape defined in Phase 5
  steps?: unknown[];
  handler?: (
    collected: Record<string, unknown>,
    context: ModuleContext,
  ) => Promise<ToolResult>;
}

// ── Module definition ───────────────────────────────────────────────────

export interface BloomBotModule {
  /** Unique module id — stable, used in logs and `module.<id>` prompt section */
  id: string;
  /** Human-readable name */
  name: string;
  /** One-line description (shown in system prompt) */
  description: string;
  /** Tools this module exposes to Gemini */
  tools: ToolDefinition[];
  /** Handler routed by tool name */
  execute: (
    toolName: string,
    args: Record<string, unknown>,
    context: ModuleContext,
  ) => Promise<ToolResult>;
  /** Optional proactive triggers (Phase 2 dispatcher) */
  proactiveTriggers?: ProactiveTrigger[];
  /** Optional zero-cost reactive flows (Phase 5) */
  scriptedFlows?: ScriptedFlow[];
  /** Fallback system prompt fragment (runtime source is `module.<id>` row in katie_prompt) */
  systemPromptFragment?: string;
  /** Which roles can use this module. Default: all roles. Admin-only modules set ['admin']. */
  rolesAllowed?: BotRole[];
  /** Disabled modules are skipped entirely (default: enabled) */
  enabled?: boolean;
}

// Re-exports for convenience
export type { BotRole, CurrentSurface, ChildSummary };
