/**
 * `history` module — searches prior conversation turns.
 *
 * Complements the agent-memory module: memory holds durable facts Katie
 * chose to remember; history holds the verbatim message log. Use this
 * when the user says "find when we talked about X" or "what did I tell
 * you two weeks ago".
 *
 * Scoped to this bot's messages only (eq bloombot_id). Substring match
 * via ILIKE — fine for current traffic; if this grows large enough to
 * matter, swap in pg_trgm + a GIN index without changing the tool
 * signature.
 */

import type { BloomBotModule, ToolResult } from "./types";

interface MessageRow {
  id: string;
  role: string;
  content: string;
  surface_route: string | null;
  created_at: string;
  trigger_source: string | null;
}

function snippet(content: string, query: string, window = 80): string {
  const lower = content.toLowerCase();
  const i = lower.indexOf(query.toLowerCase());
  if (i < 0) return content.slice(0, window);
  const start = Math.max(0, i - 20);
  const end = Math.min(content.length, i + query.length + 40);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

async function searchHistory(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const query =
    typeof args.query === "string" && args.query.trim().length > 0
      ? args.query.trim()
      : null;
  if (!query) {
    return {
      success: false,
      error: "search_history needs a `query` string.",
    };
  }

  const from =
    typeof args.from === "string" && args.from.trim().length > 0
      ? args.from.trim()
      : null;
  const to =
    typeof args.to === "string" && args.to.trim().length > 0
      ? args.to.trim()
      : null;
  const limit = Math.min(
    50,
    Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 10),
  );

  let q = ctx.supabase
    .from("chat_messages")
    .select("id, role, content, surface_route, created_at, trigger_source")
    .eq("bloombot_id", ctx.botId)
    .ilike("content", `%${query}%`);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      success: false,
      error: `Failed to search history: ${error.message}`,
    };
  }

  const rows = (data ?? []) as MessageRow[];
  const results = rows.map((r) => ({
    id: r.id,
    role: r.role,
    snippet: snippet(r.content, query),
    surface_route: r.surface_route,
    created_at: r.created_at,
    trigger_source: r.trigger_source,
  }));

  return {
    success: true,
    data: { query, count: results.length, results },
  };
}

export const historyModule: BloomBotModule = {
  id: "history",
  name: "History Search",
  description:
    "Searches prior chat_messages for this bot by substring, with optional date window. Use when the user references a past conversation.",

  tools: [
    {
      name: "search_history",
      description:
        "Find messages in this bot's history containing a given substring. Returns up to 10 snippets by default, newest first. Use for 'when did I tell you X' / 'find the conversation about Y' questions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Substring to look for (case-insensitive).",
          },
          from: {
            type: "string",
            description:
              "Optional ISO 8601 datetime — only match messages at or after this.",
          },
          to: {
            type: "string",
            description:
              "Optional ISO 8601 datetime — only match messages at or before this.",
          },
          limit: {
            type: "number",
            description: "Max results (default 10, max 50).",
          },
        },
        required: ["query"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "search_history") return searchHistory(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "Use `search_history` when the user references something they previously told you that isn't in your Memory section (e.g. 'last Tuesday we talked about…'). It returns verbatim snippets of prior chat turns. Pair with write_memory if the retrieved fact is worth promoting into long-term memory.",
};
