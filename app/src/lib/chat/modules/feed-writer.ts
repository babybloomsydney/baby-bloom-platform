/**
 * `feed-writer` module — Katie-authored tiles + soft-delete.
 *
 * create_tile: inserts bapp_logs rows with type='custom'. These render
 * via CustomTile.tsx in every existing feed surface (the tile-renderer
 * switch in BAppFeedView falls back through a `custom` case).
 *
 * delete_tile: soft-delete via is_active=false. Access check enforced
 * in code (admin client bypasses RLS). Idempotent — deleting an
 * already-inactive row returns success without a second DB write.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";

async function createTile(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (title.length === 0) {
    return {
      success: false,
      error: "create_tile needs a `title`.",
    };
  }

  const body =
    typeof args.body === "string" && args.body.trim().length > 0
      ? args.body.trim()
      : typeof args.content === "string" && args.content.trim().length > 0
        ? args.content.trim()
        : "";
  if (body.length === 0) {
    return {
      success: false,
      error: "create_tile needs a `body` describing what the tile says.",
    };
  }

  const data: Record<string, unknown> = { title, body };
  if (typeof args.image_url === "string" && args.image_url.trim().length > 0) {
    data.image_url = args.image_url.trim();
  }
  if (typeof args.badge === "string" && args.badge.trim().length > 0) {
    data.badge = args.badge.trim();
  }

  const { data: inserted, error } = await ctx.supabase
    .from("bapp_logs")
    .insert({
      child_client_id: child.id,
      author_id: ctx.userId,
      type: "custom",
      status: "completed",
      context: "adhoc",
      data,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      success: false,
      error: `Failed to create tile: ${error?.message ?? "unknown"}`,
    };
  }

  return {
    success: true,
    feedEntry: true,
    data: {
      log_id: (inserted as { id: string }).id,
      child_name: child.firstName,
      title,
    },
  };
}

async function deleteTile(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const logId =
    typeof args.log_id === "string" && args.log_id.trim().length > 0
      ? args.log_id.trim()
      : null;
  if (!logId) {
    return {
      success: false,
      error: "delete_tile needs a `log_id`.",
    };
  }

  // Load the target to check ownership and current state.
  const { data: existing, error: readErr } = await ctx.supabase
    .from("bapp_logs")
    .select("id, child_client_id, is_active")
    .eq("id", logId)
    .maybeSingle();

  if (readErr) {
    return {
      success: false,
      error: `Failed to look up tile: ${readErr.message}`,
    };
  }
  if (!existing) {
    return {
      success: false,
      error: `Tile not found (log_id=${logId}).`,
    };
  }

  const childIds = new Set(ctx.children.map((c) => c.id));
  const row = existing as {
    id: string;
    child_client_id: string;
    is_active: boolean;
  };
  if (!childIds.has(row.child_client_id)) {
    return {
      success: false,
      error:
        "You're not allowed to delete this tile — it belongs to a child you don't have access to.",
    };
  }

  if (row.is_active === false) {
    // Already soft-deleted — no-op success.
    return {
      success: true,
      data: { log_id: logId, already_inactive: true },
    };
  }

  const { error: updateErr } = await ctx.supabase
    .from("bapp_logs")
    .update({ is_active: false })
    .eq("id", logId)
    .select("id")
    .single();

  if (updateErr) {
    return {
      success: false,
      error: `Failed to soft-delete tile: ${updateErr.message}`,
    };
  }

  return {
    success: true,
    data: { log_id: logId, already_inactive: false },
  };
}

export const feedWriterModule: BloomBotModule = {
  id: "feed-writer",
  name: "Feed Writer",
  description:
    "Writes to the child-shared feed surface — bapp_logs rows with type='custom'. The feed is visible to BOTH the nanny and the child's parent. This module ONLY handles content about the child; anything private to the nanny or parent belongs in agent-memory instead.",

  tools: [
    {
      name: "create_tile",
      description:
        "Publish a custom tile to the child's SHARED feed. The tile is visible to BOTH the nanny and the child's parent — this is a co-owned developmental journal, NOT a private pinboard. ONLY use for content about the child: observations worth highlighting, educational summaries, shared notes about the child's week, captions for a photo of the child. NEVER use for nanny-private items (jobs being considered, applications, interviews, rate changes, professional reminders) or parent-private items (schedule conflicts, doubts about the placement, notes about the nanny). For anything private, use `write_memory` (scope='account') instead. If the user asks you to 'pin' or 'remember' something that isn't clearly about the child, default to memory, not create_tile.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child the tile is ABOUT (required if the user has multiple children; can omit if only one). The tile lands in this child's shared feed.",
          },
          title: {
            type: "string",
            description:
              "Short headline. Must be about the named child — not about the user's private plans, jobs, or preferences.",
          },
          body: {
            type: "string",
            description:
              "Main content of the tile, about the named child. Markdown ok (renderer handles plain text + line breaks).",
          },
          image_url: {
            type: "string",
            description:
              "Optional image URL (Cloudinary preferred). Must be a photo relevant to the child (a photo of the child, of their work, of somewhere they went).",
          },
          badge: {
            type: "string",
            description:
              "Optional short label shown on the tile (e.g. 'Summary', 'Tip', 'Milestone'). Keep it child-relevant.",
          },
        },
        required: ["title", "body"],
      },
    },
    {
      name: "delete_tile",
      description:
        "Soft-delete a feed tile by id. Reversible: sets is_active=false; the row stays in the DB but won't show in feeds. Use when the user explicitly asks to remove something.",
      parameters: {
        type: "object",
        properties: {
          log_id: {
            type: "string",
            description:
              "The log id to delete (from read_recent_feed → entries[].id).",
          },
        },
        required: ["log_id"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "create_tile") return createTile(args, ctx);
    if (toolName === "delete_tile") return deleteTile(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "CRITICAL: `create_tile` writes to the CHILD-SHARED feed. The other party (nanny ↔ parent) will see everything you put there. Use it ONLY for content about the child. If the user asks you to pin, note, or remember something that isn't about the child — a job prospect, an application, a private plan, a professional reminder, doubts, rate changes — reject that use of create_tile and route to `write_memory` with scope='account' instead. Example: user says 'add a tile about the Surry Hills job to my feed' → you save a memory, not a tile, and tell them: 'I'll keep that as a private note on your account. The child's feed is shared with [the parent / the nanny], so job-related items stay here with you.'\n\nUse `delete_tile` only when the user explicitly asks to remove something — confirm the tile contents back to them first so accidental deletes are hard. delete_tile is a soft-delete: rows stay in the DB with is_active=false, recoverable via raw SQL if needed.",
};
