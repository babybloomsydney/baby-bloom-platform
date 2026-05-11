/**
 * `agent-memory` module — Katie's plain-text long-term memory.
 *
 * Maps to the `agent_memory` table (see katie-foundation.sql). Three scopes:
 *   - account : user-level (child_client_id = NULL)
 *   - child   : private to this bot, tied to a specific child
 *   - shared  : readable by any bot with child access (cross-bot)
 *
 * Tools:
 *   - write_memory  (create)
 *   - read_memory   (list active, filtered)
 *   - update_memory (edit by id)
 *   - delete_memory (soft-delete by id)
 *
 * Search across conversation turns is a separate surface — see the
 * chat module's `search_history` tool (WU 2C.1b).
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";

const SCOPES = ["account", "child", "shared"] as const;
type Scope = (typeof SCOPES)[number];

const PRIORITIES = ["high", "medium", "low"] as const;
type Priority = (typeof PRIORITIES)[number];

interface MemoryRow {
  id: string;
  bloombot_id: string;
  child_client_id: string | null;
  scope: string;
  priority: string;
  tags: string[];
  content: string;
  relevant_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function sanitiseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 16);
}

async function writeMemory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const content = typeof args.content === "string" ? args.content.trim() : "";
  if (content.length === 0) {
    return { success: false, error: "write_memory needs non-empty `content`." };
  }

  const scopeArg = typeof args.scope === "string" ? args.scope : "account";
  if (!(SCOPES as readonly string[]).includes(scopeArg)) {
    return {
      success: false,
      error: `Invalid scope — expected one of ${SCOPES.join(", ")}.`,
    };
  }
  const scope = scopeArg as Scope;

  let childId: string | null = null;
  if (scope !== "account") {
    const r = resolveChild(args.child_name, ctx.children);
    if (r.error) return r.error;
    childId = r.child.id;
  }

  const priorityArg =
    typeof args.priority === "string" ? args.priority : "medium";
  const priority: Priority = (PRIORITIES as readonly string[]).includes(
    priorityArg,
  )
    ? (priorityArg as Priority)
    : "medium";

  const tags = sanitiseTags(args.tags);
  const relevantUntil =
    typeof args.relevant_until === "string" &&
    args.relevant_until.trim().length > 0
      ? args.relevant_until.trim()
      : null;

  const { data, error } = await ctx.supabase
    .from("agent_memory")
    .insert({
      bloombot_id: ctx.botId,
      child_client_id: childId,
      scope,
      priority,
      tags,
      content,
      relevant_until: relevantUntil,
    })
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: `Failed to write memory: ${error?.message ?? "unknown"}`,
    };
  }

  const row = data as MemoryRow;
  return {
    success: true,
    data: {
      id: row.id,
      scope: row.scope,
      priority: row.priority,
      content: row.content,
      tags: row.tags,
    },
  };
}

async function readMemory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const scopeArg = typeof args.scope === "string" ? args.scope : null;
  const priorityArg = typeof args.priority === "string" ? args.priority : null;
  const tag =
    typeof args.tag === "string" && args.tag.trim().length > 0
      ? args.tag.trim().toLowerCase()
      : null;
  const limit = Math.min(
    100,
    Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 30),
  );

  let query = ctx.supabase
    .from("agent_memory")
    .select()
    .eq("bloombot_id", ctx.botId)
    .eq("is_active", true);

  if (scopeArg && (SCOPES as readonly string[]).includes(scopeArg)) {
    query = query.eq("scope", scopeArg);
  }
  if (priorityArg && (PRIORITIES as readonly string[]).includes(priorityArg)) {
    query = query.eq("priority", priorityArg);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      success: false,
      error: `Failed to read memory: ${error.message}`,
    };
  }

  const rows = (data ?? []) as MemoryRow[];
  const memories = rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    priority: r.priority,
    tags: r.tags,
    content: r.content,
    relevant_until: r.relevant_until,
    created_at: r.created_at,
    updated_at: r.updated_at,
    child_client_id: r.child_client_id,
  }));

  return {
    success: true,
    data: { count: memories.length, memories },
  };
}

async function updateMemory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const id =
    typeof args.id === "string" && args.id.trim().length > 0
      ? args.id.trim()
      : null;
  if (!id) return { success: false, error: "update_memory needs an `id`." };

  const patch: Record<string, unknown> = {};
  if (typeof args.content === "string" && args.content.trim().length > 0) {
    patch.content = args.content.trim();
  }
  if (typeof args.priority === "string") {
    if (!(PRIORITIES as readonly string[]).includes(args.priority)) {
      return { success: false, error: "priority must be high|medium|low." };
    }
    patch.priority = args.priority;
  }
  if (Array.isArray(args.tags)) {
    patch.tags = sanitiseTags(args.tags);
  }
  if (typeof args.relevant_until === "string") {
    patch.relevant_until =
      args.relevant_until.trim().length > 0 ? args.relevant_until.trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return { success: false, error: "Nothing to update." };
  }

  const { data, error } = await ctx.supabase
    .from("agent_memory")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: `Failed to update memory: ${error?.message ?? "not found"}`,
    };
  }

  const row = data as MemoryRow;
  return {
    success: true,
    data: { id: row.id, content: row.content, priority: row.priority },
  };
}

async function deleteMemory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const id =
    typeof args.id === "string" && args.id.trim().length > 0
      ? args.id.trim()
      : null;
  if (!id) return { success: false, error: "delete_memory needs an `id`." };

  const { error } = await ctx.supabase
    .from("agent_memory")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: `Failed to delete memory: ${error.message}`,
    };
  }

  return { success: true, data: { id, deleted: true } };
}

export const agentMemoryModule: BloomBotModule = {
  id: "agent-memory",
  name: "Memory",
  description:
    "Katie's long-term memory store. Three scopes: account (user-level, no child), child (private to this bot + one child), shared (visible to any bot with access to the same child).",
  childScoped: true,

  tools: [
    {
      name: "write_memory",
      description:
        "Save a durable fact or preference you want to remember across conversations. Prefer this over trying to repeat context each turn. Use sparingly — memories should be stable, not ephemeral chat state.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The fact or preference, phrased plainly.",
          },
          scope: {
            type: "string",
            enum: ["account", "child", "shared"],
            description:
              "account = about the user, no child attached. child = about one child, private to this bot. shared = about one child, cross-bot.",
          },
          child_name: {
            type: "string",
            description: "Required for child/shared scope.",
          },
          priority: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "Relative importance. high memories are surfaced to the prompt first. Default medium.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional tags (e.g. ['allergy','routine']). Lowercased, trimmed, max 16.",
          },
          relevant_until: {
            type: "string",
            description:
              "Optional ISO date (YYYY-MM-DD) after which this memory becomes stale.",
          },
        },
        required: ["content", "scope"],
      },
    },
    {
      name: "read_memory",
      description:
        "List active memories for this bot, optionally filtered by scope, priority, or tag.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["account", "child", "shared"] },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          tag: { type: "string" },
          limit: {
            type: "number",
            description: "Default 30, max 100.",
          },
        },
        required: [],
      },
    },
    {
      name: "update_memory",
      description:
        "Edit an existing memory by id. Pass any of content / priority / tags / relevant_until to change.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          tags: { type: "array", items: { type: "string" } },
          relevant_until: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_memory",
      description:
        "Soft-delete a memory by id (sets is_active=false). The row stays in the DB so it can be recovered.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "write_memory") return writeMemory(args, ctx);
    if (toolName === "read_memory") return readMemory(args, ctx);
    if (toolName === "update_memory") return updateMemory(args, ctx);
    if (toolName === "delete_memory") return deleteMemory(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `write_memory` to remember durable facts, preferences, or routines across conversations — don't repeat large context each turn. `read_memory` lists what you already know (the relevant slice is already surfaced in your system prompt, so only read_memory when you specifically need to inspect or refine). `update_memory` / `delete_memory` when the user corrects or retires something. Scopes: account (about the user), child (about one child, private to you), shared (about one child, cross-bot). Default to account or child; use shared only when the fact is useful for other bots too.",
};
