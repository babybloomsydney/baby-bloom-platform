/**
 * `feed` module — reads a child's recent feed entries.
 *
 * Phase 1 read-only module. One tool: read_recent_feed.
 */

import type { BloomBotModule, ToolResult } from "./types";
import { resolveChild } from "./utils";
import { isRecentFeedFulfilled } from "@/lib/chat/preload/predicates";

type FeedType =
  | "activity"
  | "report"
  | "progress"
  | "observation"
  | "diary"
  | "insight"
  | "custom";

async function readRecentFeed(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = resolveChild(args.child_name, ctx.children);
  if (r.error) return r.error;
  const child = r.child;

  const limit = Math.min(
    50,
    Math.max(1, typeof args.limit === "number" ? args.limit : 10),
  );
  const typeFilter = args.type_filter as FeedType | undefined;

  // `internal_notes` is included on Katie's feed-read so she can see
  // her own private context on previously-created tiles. Critical:
  // this is Katie's tool-result surface, NOT the user-visible feed
  // UI — the response flows into Katie's prompt context, never
  // straight to the parent/nanny. The prompt fragment below
  // explicitly instructs Katie to USE these notes as context but
  // never quote them back. The user-facing `getFeed` action in
  // src/lib/actions/bapp/feed.ts deliberately OMITS this column.
  let query = ctx.supabase
    .from("bapp_logs")
    .select(
      "id, type, status, context, data, author_id, created_at, updated_at, internal_notes",
    )
    .eq("child_client_id", child.id)
    .eq("is_active", true) // see READINESS-ASSESSMENT.md H1 — soft-delete filter
    .order("created_at", { ascending: false })
    .limit(limit);

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      error: `Failed to read feed: ${error.message}`,
    };
  }

  return {
    success: true,
    data: {
      child_name: child.firstName,
      count: data?.length ?? 0,
      entries: data ?? [],
    },
  };
}

export const feedModule: BloomBotModule = {
  id: "feed",
  name: "Feed Reader",
  description:
    "Reads a child's recent feed entries (observations, activities, diary, insights, progress, custom tiles).",

  tools: [
    {
      name: "read_recent_feed",
      description:
        "Read a child's recent feed — newest first. Use before giving suggestions to avoid repeating or missing context.",
      parameters: {
        type: "object",
        properties: {
          child_name: {
            type: "string",
            description:
              "Which child (required if the user has multiple children; can omit if only one)",
          },
          limit: {
            type: "number",
            description: "Number of entries to return (default 10, max 50)",
          },
          type_filter: {
            type: "string",
            enum: [
              "activity",
              "report",
              "progress",
              "observation",
              "diary",
              "insight",
              "custom",
            ],
            description: "Filter to a specific entry type (optional)",
          },
        },
        required: [],
      },
      isPrefulfilled: isRecentFeedFulfilled,
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_recent_feed") return readRecentFeed(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `read_recent_feed` to see a child's recent history before making suggestions. Ordered newest-first. Filter by `type_filter` when you want a specific category.\n\nEntries may carry an `internal_notes` field — these are PRIVATE context notes you wrote yourself in earlier turns, never seen by the parent or nanny. Use them silently to inform your replies (e.g. recall that the parent flagged a sleep regression). NEVER quote internal_notes back in your visible message; treat them strictly as background memory.",
};
