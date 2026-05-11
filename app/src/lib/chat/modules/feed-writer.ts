/**
 * `feed-writer` module — Katie-authored tiles + soft-delete.
 *
 * Two-turn (WU 8.22d): create_tile is the propose path — returns a
 * `kind: "draft"` tile carrying the would-be katie_note preview. The
 * actual bapp_logs insert happens via applyCreateTile when the user
 * clicks Accept.
 *
 * delete_tile remains a direct one-shot — not a log creation, so the
 * draft pattern doesn't apply (per the WU spec "logs, progress,
 * activity reports, diary entries"). Soft-delete via is_active=false
 * is reversible enough that an Accept gate would just add friction.
 */

import type { BloomBotModule, ToolResult, ChildSummary } from "./types";
import type { KatieNoteTile } from "@/lib/chat/tiles";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BAppLogInsert } from "@/types/bapp";
import { resolveChild } from "./utils";

interface PreparedCustom {
  child: ChildSummary;
  data: Record<string, unknown>;
  tilePreview: KatieNoteTile;
  /** Optional Katie-private context note. Stored in
   *  `bapp_logs.internal_notes` (added by katie-internal-notes.sql);
   *  excluded from every user-facing SELECT — see that migration's
   *  header. */
  internalNotes: string | null;
}

function prepareCustom(
  args: Record<string, unknown>,
  children: ChildSummary[],
):
  | { ok: true; prepared: PreparedCustom }
  | { ok: false; error: string; terminal?: boolean } {
  const r = resolveChild(args.child_name, children);
  if (r.error) {
    return {
      ok: false,
      error: r.error.error ?? "Could not resolve child.",
      terminal: r.error.terminal,
    };
  }
  const child = r.child;

  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (title.length === 0) {
    return { ok: false, error: "create_tile needs a `title`." };
  }

  const body =
    typeof args.body === "string" && args.body.trim().length > 0
      ? args.body.trim()
      : typeof args.content === "string" && args.content.trim().length > 0
        ? args.content.trim()
        : "";
  if (body.length === 0) {
    return {
      ok: false,
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

  // Katie-private notes — kept out of `data` (which is user-visible)
  // and threaded separately to the apply step which writes to the
  // dedicated `bapp_logs.internal_notes` column. Trimmed; empty
  // strings collapse to null so we don't store whitespace.
  const internalNotesRaw =
    typeof args.internal_notes === "string" ? args.internal_notes.trim() : "";
  const internalNotes = internalNotesRaw.length > 0 ? internalNotesRaw : null;

  const tileImage =
    typeof data.image_url === "string" && data.image_url.length > 0
      ? data.image_url
      : undefined;
  const tileBadge =
    typeof data.badge === "string" && data.badge.length > 0
      ? data.badge
      : undefined;
  const tilePreview: KatieNoteTile = {
    kind: "katie_note",
    data: {
      title,
      body,
      ...(tileImage ? { image_url: tileImage } : {}),
      ...(tileBadge ? { badge: tileBadge } : {}),
    },
  };

  return {
    ok: true,
    prepared: { child, data, tilePreview, internalNotes },
  };
}

// ── Propose path (LLM-callable) ──────────────────────────────────────────

async function proposeCreateTile(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const r = prepareCustom(args, ctx.children);
  if (!r.ok) {
    return { success: false, error: r.error, terminal: r.terminal };
  }
  const { child, tilePreview } = r.prepared;
  const draftId = `draft_${crypto.randomUUID()}`;
  return {
    success: true,
    data: {
      draft_id: draftId,
      child_name: child.firstName,
      title: tilePreview.data.title ?? null,
    },
    tile: {
      kind: "draft",
      data: {
        draftId,
        toolName: "create_tile",
        args,
        preview: tilePreview,
      },
    },
  };
}

// ── Apply path (frontend-callable via /api/chat/drafts/accept) ───────────

export interface CustomApplyResult {
  ok: true;
  tile: KatieNoteTile;
  data: { log_id: string; child_name: string };
}

export interface CustomApplyError {
  ok: false;
  error: string;
}

export async function applyCreateTile(
  args: Record<string, unknown>,
  ctx: { userId: string; children: ChildSummary[]; supabase: SupabaseClient },
): Promise<CustomApplyResult | CustomApplyError> {
  const r = prepareCustom(args, ctx.children);
  if (!r.ok) return { ok: false, error: r.error };
  const { child, data, tilePreview, internalNotes } = r.prepared;

  // Insert payload typed against `BAppLogInsert` so it stays in
  // sync with the canonical `BAppLog` row shape. Adding a column
  // to BAppLog will surface here as a TS error rather than silent
  // drift. The narrow literal types on `type`/`status`/`context`
  // are pinned to the values custom tiles always use.
  const insertPayload: BAppLogInsert = {
    child_client_id: child.id,
    author_id: ctx.userId,
    type: "custom",
    status: "completed",
    context: "adhoc",
    data,
  };
  if (internalNotes) {
    insertPayload.internal_notes = internalNotes;
  }

  const { data: inserted, error } = await ctx.supabase
    .from("bapp_logs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !inserted) {
    return {
      ok: false,
      error: `Failed to create tile: ${error?.message ?? "unknown"}`,
    };
  }
  const logId = (inserted as { id: string }).id;

  // INSIGHTS — A-09 deferred-by-design.
  //
  // The user's brief asks Katie-authored tiles to generate insights
  // "just like manual tile creations do (only select tiles, not all
  // of them)". The existing `generateTileInsight` pipeline
  // (src/lib/actions/bapp/insights.ts) is structured around the
  // manual flow's domain / milestone / mastery context — its
  // entryType union is `"progress" | "observation" | "report"` and
  // its prompt is grounded in the dev-domain framework.
  //
  // Custom tiles are freeform Katie notes with no inherent domain
  // anchor. Wiring them through the existing pipeline would either
  // break the type union or produce off-topic insights. The
  // architecturally correct path is:
  //   1. Add a custom-shaped prompt + entryType to insights.ts
  //      (or split into a dedicated module).
  //   2. Wire that here, gated on body substantiveness.
  // That's a separate work-unit because it's a prompt-design
  // decision, not a refactor — left for the next pass so this
  // amendment ships without an under-baked AI surface.
  //
  // When Katie gains `log_observation` / `log_progress` /
  // `submit_report` tools (Phase 2 in IMPLEMENTATION-PLAN.md), they
  // MUST call `generateTileInsight` exactly the way the manual
  // server actions do (insights.ts is non-fatal — try/catch around
  // it preserves the log).

  return {
    ok: true,
    data: { log_id: logId, child_name: child.firstName },
    tile: tilePreview,
  };
}

// ── Direct (non-draft) tools ─────────────────────────────────────────────

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
    "Drafts custom tiles for the child-shared feed (bapp_logs type='custom'). The feed is visible to BOTH the nanny and the child's parent. ONLY for content about the child; anything private goes through agent-memory instead.",
  childScoped: true,

  tools: [
    {
      name: "create_tile",
      description:
        "Draft a custom tile for the child's SHARED feed (visible to BOTH the nanny and the child's parent — this is a co-owned developmental journal). Returns a draft tile the user must Accept; nothing is published until Accept. ONLY use for content about the child: observations worth highlighting, educational summaries, shared notes about the child's week, captions for a photo. NEVER use for private items (jobs, applications, interviews, schedule conflicts, doubts about a placement) — those go to `write_memory` with scope='account'.",
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
          internal_notes: {
            type: "string",
            description:
              "PRIVATE notes about WHY this tile matters that ONLY you (Katie) will read in future context — never shown to the parent or nanny. Use to capture context the family doesn't need to see: 'parent flagged screen-time concerns last week', 'child seemed quiet during this observation', 'tracking sleep regression that started 2 weeks ago'. Optional. Skip when the tile body already covers everything you'd want to remember.",
          },
        },
        required: ["title", "body"],
      },
    },
    {
      name: "delete_tile",
      description:
        "Soft-delete a feed tile by id. Reversible: sets is_active=false; the row stays in the DB but won't show in feeds. Direct one-shot — does NOT use the draft/Accept pattern. Use when the user explicitly asks to remove something.",
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
    if (toolName === "create_tile") return proposeCreateTile(args, ctx);
    if (toolName === "delete_tile") return deleteTile(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "CRITICAL: `create_tile` drafts a tile for the CHILD-SHARED feed. The other party (nanny ↔ parent) will see it after the user accepts. Use it ONLY for content about the child. If the user asks you to pin, note, or remember something that isn't about the child — a job prospect, an application, a private plan, a professional reminder, doubts, rate changes — reject that use of create_tile and route to `write_memory` with scope='account' instead.\n\n`create_tile` returns a DRAFT tile — say something like 'Drafted that — review and accept' and stop. The user's Accept publishes it.\n\nUse `delete_tile` only when the user explicitly asks to remove something — confirm the tile contents back to them first so accidental deletes are hard. delete_tile is a soft-delete and does NOT use the draft pattern; it executes immediately on call.",
};
