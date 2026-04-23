/**
 * Memory context builder.
 *
 * Pre-renders a plain-text "Memory" section that gets injected into the
 * system prompt via BotContext.memoryTable (see src/lib/chat/context.ts).
 *
 * Selection policy:
 *   - bot's own rows (any scope) + shared-scope rows for any child the user
 *     has access to
 *   - is_active = true
 *   - relevant_until is NULL or >= today
 *   - ordered by priority (high/medium/low), then updated_at desc
 *   - capped at `maxLines` (default 30) to avoid blowing context
 *
 * Output shape (Markdown-flavoured so Gemini treats it as structured):
 *
 *   ## Memory
 *   - [high] User prefers mornings
 *   - [medium] Oliver is allergic to peanuts [allergy]
 *
 * Returns null when no usable memories exist so callers can drop the
 * section entirely.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface MemoryRow {
  id: string;
  scope: string;
  priority: string;
  tags: string[] | null;
  content: string;
  relevant_until: string | null;
  updated_at: string;
}

interface BuildMemoryTableArgs {
  botId: string;
  /** Child ids the user has access to — surfaces shared-scope memories. */
  childIds: string[];
  supabase: SupabaseClient;
  /** Maximum bullet lines to render. Default 30. */
  maxLines?: number;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function isLive(row: MemoryRow, todayIso: string): boolean {
  if (!row.relevant_until) return true;
  return row.relevant_until >= todayIso;
}

export async function buildMemoryTable(
  args: BuildMemoryTableArgs,
): Promise<string | null> {
  const { botId, childIds, supabase } = args;
  const maxLines = args.maxLines ?? 30;

  // Two selection lanes:
  //   1. All memories this bot owns (every scope).
  //   2. Shared-scope memories tied to a child we can access.
  //
  // Union via an OR: bloombot_id = me OR (scope='shared' AND child_client_id IN childIds)
  const ownCondition = `bloombot_id.eq.${botId}`;
  const sharedCondition =
    childIds.length > 0
      ? `and(scope.eq.shared,child_client_id.in.(${childIds.join(",")}))`
      : null;
  const orExpr = sharedCondition
    ? `${ownCondition},${sharedCondition}`
    : ownCondition;

  const { data, error } = await supabase
    .from("agent_memory")
    .select("id, scope, priority, tags, content, relevant_until, updated_at")
    .or(orExpr)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(maxLines * 3); // over-fetch so post-filtering still has enough rows

  if (error || !data || data.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data as MemoryRow[]).filter((r) => isLive(r, today));
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    // tie-break by updated_at desc (more recent first)
    return b.updated_at.localeCompare(a.updated_at);
  });

  const capped = rows.slice(0, maxLines);

  const lines = capped.map((r) => {
    const tags = (r.tags ?? []).filter(Boolean);
    const tagSuffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const content = r.content.trim().replace(/\s+/g, " ");
    return `- [${r.priority}] ${content}${tagSuffix}`;
  });

  return `## Memory\n\nThings you already know about this user. Apply them naturally; don't announce that you "remembered" something.\n\n${lines.join("\n")}`;
}
