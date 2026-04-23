/**
 * `katie-admin` module — admin-only introspection + editing tools.
 *
 * rolesAllowed: ['admin']. Exposes read-only inspection of Katie's own
 * configuration (prompt sections, modules, tool surface). Proposal +
 * apply tools for prompt edits land in a follow-up WU; this commit
 * ships the inspection surface first so admin users can see what they're
 * about to change.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BloomBotModule, ToolResult } from "./types";
import { lineDiff } from "@/lib/chat/admin/diff";

// Lazy import to avoid the cycle: katie-admin is in the registry, and
// these handlers need to inspect the registry.
async function getActiveModulesLazy(): Promise<BloomBotModule[]> {
  const { getActiveModules } = await import("./registry");
  return getActiveModules();
}

const EDIT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EDIT_RATE_LIMIT = 20; // apply + rollback calls combined

interface PromptSectionRow {
  section: string;
  content: string;
  version: number;
  protected: boolean;
  is_active?: boolean;
  updated_at?: string | null;
}

async function readAllPromptSections(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const { data, error } = await ctx.supabase
    .from("katie_prompt")
    .select("section, content, version, protected, updated_at")
    .eq("is_active", true)
    .order("section", { ascending: true })
    .limit(200);

  if (error) {
    return {
      success: false,
      error: `Failed to list sections: ${error.message}`,
    };
  }

  const rows = (data ?? []) as PromptSectionRow[];
  return {
    success: true,
    data: {
      count: rows.length,
      sections: rows.map((r) => ({
        section: r.section,
        version: r.version,
        protected: r.protected,
        chars: r.content?.length ?? 0,
        updated_at: r.updated_at ?? null,
      })),
    },
  };
}

async function readPromptSection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const section =
    typeof args.section === "string" && args.section.trim().length > 0
      ? args.section.trim()
      : null;
  if (!section) {
    return {
      success: false,
      error: "read_prompt_section needs a `section` name (e.g. 'identity').",
    };
  }

  const { data, error } = await ctx.supabase
    .from("katie_prompt")
    .select("section, content, version, protected, updated_at")
    .eq("section", section)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return {
      success: false,
      error: `Failed to read section: ${error.message}`,
    };
  }
  if (!data) {
    return {
      success: false,
      error: `Section not found: ${section}. Use read_all_prompt_sections for the full list.`,
    };
  }

  const row = data as PromptSectionRow;
  return {
    success: true,
    data: {
      section: row.section,
      content: row.content,
      version: row.version,
      protected: row.protected,
      chars: row.content.length,
      updated_at: row.updated_at ?? null,
    },
  };
}

async function readModuleRegistry(
  _args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const modules = await getActiveModulesLazy();
  return {
    success: true,
    data: {
      count: modules.length,
      modules: modules.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        tool_count: m.tools.length,
        tool_names: m.tools.map((t) => t.name),
        roles_allowed: m.rolesAllowed ?? null,
        has_prompt_fragment: Boolean(m.systemPromptFragment),
      })),
    },
  };
}

async function readModuleDefinition(
  args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const moduleId =
    typeof args.module_id === "string" && args.module_id.trim().length > 0
      ? args.module_id.trim()
      : null;
  if (!moduleId) {
    return {
      success: false,
      error: "read_module_definition needs `module_id`.",
    };
  }
  const modules = await getActiveModulesLazy();
  const mod = modules.find((m) => m.id === moduleId);
  if (!mod) {
    return {
      success: false,
      error: `Unknown module_id: ${moduleId}. Use read_module_registry for the full list.`,
    };
  }

  return {
    success: true,
    data: {
      id: mod.id,
      name: mod.name,
      description: mod.description,
      roles_allowed: mod.rolesAllowed ?? null,
      system_prompt_fragment: mod.systemPromptFragment ?? null,
      tools: mod.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      proactive_trigger_count: mod.proactiveTriggers?.length ?? 0,
    },
  };
}

async function fetchActiveSection(
  ctx: Parameters<BloomBotModule["execute"]>[2],
  section: string,
): Promise<PromptSectionRow | null> {
  const { data } = await ctx.supabase
    .from("katie_prompt")
    .select("section, content, version, protected")
    .eq("section", section)
    .eq("is_active", true)
    .maybeSingle();
  return (data as PromptSectionRow | null) ?? null;
}

async function checkRateLimit(
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.now() - EDIT_RATE_WINDOW_MS).toISOString();
  const { data, error } = await ctx.supabase
    .from("katie_prompt_edits")
    .select("id")
    .eq("applied_by", ctx.userId)
    .gte("applied_at", since)
    .limit(EDIT_RATE_LIMIT + 1);
  if (error) {
    // Fail open — rate limit is a guardrail, not a security boundary.
    return { ok: true };
  }
  const recent = (data ?? []).length;
  if (recent >= EDIT_RATE_LIMIT) {
    return {
      ok: false,
      error: `Rate limit reached — ${recent} prompt edits in the last hour (max ${EDIT_RATE_LIMIT}). Wait before applying more.`,
    };
  }
  return { ok: true };
}

async function proposePromptEdit(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const section =
    typeof args.section === "string" && args.section.trim().length > 0
      ? args.section.trim()
      : null;
  const newContent =
    typeof args.new_content === "string" ? args.new_content : null;
  if (!section) {
    return { success: false, error: "propose_prompt_edit needs `section`." };
  }
  if (newContent === null) {
    return {
      success: false,
      error: "propose_prompt_edit needs `new_content` (can be empty string).",
    };
  }

  const current = await fetchActiveSection(ctx, section);
  if (!current) {
    return {
      success: false,
      error: `Section not found: ${section}. Use read_all_prompt_sections for the full list.`,
    };
  }

  const diff = lineDiff(current.content, newContent);
  const noop = diff.added === 0 && diff.removed === 0;

  return {
    success: true,
    data: {
      section,
      protected: current.protected,
      current_version: current.version,
      current_chars: current.content.length,
      new_chars: newContent.length,
      noop,
      diff: {
        added: diff.added,
        removed: diff.removed,
        unified: diff.unified,
      },
      next_step: noop
        ? "Identical to current content — nothing to apply."
        : current.protected
          ? `Protected section. To apply, call apply_prompt_edit with confirm_protected=true.`
          : `Call apply_prompt_edit with the same section + new_content to commit.`,
    },
  };
}

async function applyPromptEdit(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const section =
    typeof args.section === "string" && args.section.trim().length > 0
      ? args.section.trim()
      : null;
  const newContent =
    typeof args.new_content === "string" ? args.new_content : null;
  const reason =
    typeof args.reason === "string" && args.reason.trim().length > 0
      ? args.reason.trim()
      : null;
  const confirmProtected = args.confirm_protected === true;

  if (!section) {
    return { success: false, error: "apply_prompt_edit needs `section`." };
  }
  if (newContent === null) {
    return { success: false, error: "apply_prompt_edit needs `new_content`." };
  }
  if (!reason) {
    return {
      success: false,
      error: "apply_prompt_edit needs `reason` — a short note explaining why.",
    };
  }

  const rate = await checkRateLimit(ctx);
  if (!rate.ok) return { success: false, error: rate.error };

  const current = await fetchActiveSection(ctx, section);
  if (!current) {
    return { success: false, error: `Section not found: ${section}.` };
  }
  if (current.content === newContent) {
    return {
      success: false,
      error: "new_content is identical to the current content — nothing to do.",
    };
  }
  if (current.protected && !confirmProtected) {
    return {
      success: false,
      error: `Section '${section}' is protected. Re-call apply_prompt_edit with confirm_protected=true to proceed.`,
    };
  }

  const diff = lineDiff(current.content, newContent);
  const nextVersion = current.version + 1;

  // Deactivate the current row, insert a new active row at the next version.
  // (katie_prompt has a unique partial index on (section) WHERE is_active,
  // so we need to flip the old one first.)
  const { error: deactivateErr } = await ctx.supabase
    .from("katie_prompt")
    .update({ is_active: false })
    .eq("section", section)
    .eq("is_active", true);
  if (deactivateErr) {
    return {
      success: false,
      error: `Failed to deactivate current row: ${deactivateErr.message}`,
    };
  }

  const { error: insertErr } = await ctx.supabase.from("katie_prompt").insert({
    section,
    content: newContent,
    version: nextVersion,
    protected: current.protected,
    is_active: true,
  });
  if (insertErr) {
    // Attempt recovery — reactivate the old row to leave prod consistent.
    await ctx.supabase
      .from("katie_prompt")
      .update({ is_active: true })
      .eq("section", section)
      .eq("version", current.version);
    return {
      success: false,
      error: `Failed to insert new version: ${insertErr.message}`,
    };
  }

  const { data: edit } = await ctx.supabase
    .from("katie_prompt_edits")
    .insert({
      bloombot_id: ctx.botId,
      section,
      before_content: current.content,
      after_content: newContent,
      before_version: current.version,
      after_version: nextVersion,
      diff: diff.unified,
      reason,
      status: "applied",
      applied_by: ctx.userId,
    })
    .select("id")
    .single();

  return {
    success: true,
    data: {
      section,
      before_version: current.version,
      after_version: nextVersion,
      chars_changed: diff.added + diff.removed,
      edit_id: (edit as { id: string } | null)?.id ?? null,
    },
  };
}

async function rollbackPromptEdit(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const editId =
    typeof args.edit_id === "string" && args.edit_id.trim().length > 0
      ? args.edit_id.trim()
      : null;
  const reason =
    typeof args.reason === "string" && args.reason.trim().length > 0
      ? args.reason.trim()
      : null;
  if (!editId) {
    return { success: false, error: "rollback_prompt_edit needs `edit_id`." };
  }
  if (!reason) {
    return {
      success: false,
      error: "rollback_prompt_edit needs `reason`.",
    };
  }

  const rate = await checkRateLimit(ctx);
  if (!rate.ok) return { success: false, error: rate.error };

  const { data: editRow, error: fetchErr } = await ctx.supabase
    .from("katie_prompt_edits")
    .select(
      "id, section, before_content, before_version, after_version, status",
    )
    .eq("id", editId)
    .maybeSingle();
  if (fetchErr) {
    return {
      success: false,
      error: `Failed to load edit: ${fetchErr.message}`,
    };
  }
  if (!editRow) {
    return { success: false, error: `Edit not found: ${editId}` };
  }
  const edit = editRow as {
    id: string;
    section: string;
    before_content: string;
    before_version: number;
    after_version: number;
    status: string;
  };
  if (edit.status !== "applied") {
    return {
      success: false,
      error: `Edit ${editId} is already ${edit.status}.`,
    };
  }

  // Walk back: apply an edit whose new content is the edit's before_content.
  const current = await fetchActiveSection(ctx, edit.section);
  if (!current) {
    return {
      success: false,
      error: `Section ${edit.section} is no longer active — cannot roll back.`,
    };
  }

  const diff = lineDiff(current.content, edit.before_content);
  const nextVersion = current.version + 1;

  await ctx.supabase
    .from("katie_prompt")
    .update({ is_active: false })
    .eq("section", edit.section)
    .eq("is_active", true);

  const { error: insertErr } = await ctx.supabase.from("katie_prompt").insert({
    section: edit.section,
    content: edit.before_content,
    version: nextVersion,
    protected: current.protected,
    is_active: true,
  });
  if (insertErr) {
    await ctx.supabase
      .from("katie_prompt")
      .update({ is_active: true })
      .eq("section", edit.section)
      .eq("version", current.version);
    return {
      success: false,
      error: `Failed to restore: ${insertErr.message}`,
    };
  }

  const { data: newEdit } = await ctx.supabase
    .from("katie_prompt_edits")
    .insert({
      bloombot_id: ctx.botId,
      section: edit.section,
      before_content: current.content,
      after_content: edit.before_content,
      before_version: current.version,
      after_version: nextVersion,
      diff: diff.unified,
      reason: `rollback of edit ${edit.id}: ${reason}`,
      status: "applied",
      applied_by: ctx.userId,
    })
    .select("id")
    .single();

  // Mark the original edit as rolled_back + point at the new edit.
  const newEditId = (newEdit as { id: string } | null)?.id;
  if (newEditId) {
    await ctx.supabase
      .from("katie_prompt_edits")
      .update({
        status: "rolled_back",
        rolled_back_by_edit_id: newEditId,
      })
      .eq("id", edit.id);
  }

  return {
    success: true,
    data: {
      rolled_back_edit_id: edit.id,
      section: edit.section,
      restored_to_content_chars: edit.before_content.length,
      new_version: nextVersion,
      rollback_edit_id: newEditId ?? null,
    },
  };
}

// ── System inventory (3B) ─────────────────────────────────────────────────

interface Manifest {
  generated_at: string;
  summary: Record<string, number>;
  routes: Array<{ path: string; methods: string[]; file: string }>;
  pages: Array<{ path: string; file: string }>;
  crons: Array<{ path: string; schedule: string }>;
  migrations: Array<{ filename: string; bytes: number; modified_at: string }>;
  server_actions: Array<{ file: string; functions: string[] }>;
}

let manifestCache: { loadedAt: number; value: Manifest } | null = null;
const MANIFEST_TTL_MS = 60 * 1000; // 60s — fresh enough; cheap to reload

async function loadManifest(): Promise<Manifest | null> {
  if (manifestCache && Date.now() - manifestCache.loadedAt < MANIFEST_TTL_MS) {
    return manifestCache.value;
  }
  try {
    const path = join(process.cwd(), "public/katie-manifest.json");
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Manifest;
    manifestCache = { loadedAt: Date.now(), value: parsed };
    return parsed;
  } catch {
    return null;
  }
}

const INVENTORY_SECTIONS = [
  "summary",
  "routes",
  "pages",
  "crons",
  "migrations",
  "server_actions",
] as const;

async function readSystemInventory(
  args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const manifest = await loadManifest();
  if (!manifest) {
    return {
      success: false,
      error:
        "katie-manifest.json not found. Run `npm run generate:manifest` (also auto-runs on prebuild).",
    };
  }

  const sectionArg =
    typeof args.section === "string" && args.section.trim().length > 0
      ? args.section.trim()
      : null;

  if (!sectionArg) {
    return {
      success: true,
      data: {
        generated_at: manifest.generated_at,
        summary: manifest.summary,
        available_sections: INVENTORY_SECTIONS,
        next_step:
          "Pass `section` to drill into a specific area (e.g. 'crons', 'routes').",
      },
    };
  }

  if (!(INVENTORY_SECTIONS as readonly string[]).includes(sectionArg)) {
    return {
      success: false,
      error: `Unknown section '${sectionArg}'. Valid: ${INVENTORY_SECTIONS.join(", ")}.`,
    };
  }

  const match =
    typeof args.match === "string" && args.match.trim().length > 0
      ? args.match.trim().toLowerCase()
      : null;
  const limit = Math.min(
    500,
    Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 200),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = (manifest as any)[sectionArg] as unknown;
  if (Array.isArray(data) && match) {
    data = data.filter((row) => {
      const j = JSON.stringify(row).toLowerCase();
      return j.includes(match);
    });
  }
  if (Array.isArray(data)) {
    data = (data as unknown[]).slice(0, limit);
  }

  return {
    success: true,
    data: {
      generated_at: manifest.generated_at,
      section: sectionArg,
      match,
      count: Array.isArray(data) ? data.length : 1,
      rows: data,
    },
  };
}

// ── Proposals (3E) ─────────────────────────────────────────────────────────

const PROPOSAL_KINDS = [
  "module_change",
  "schema_change",
  "prompt_change",
  "other",
] as const;
type ProposalKind = (typeof PROPOSAL_KINDS)[number];

const PROPOSAL_STATUSES = [
  "open",
  "accepted",
  "rejected",
  "implemented",
] as const;
type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

interface ProposalInsert {
  kind: ProposalKind;
  target: string;
  summary: string;
  details: string | null;
  suggested_diff: string | null;
}

async function insertProposal(
  ctx: Parameters<BloomBotModule["execute"]>[2],
  input: ProposalInsert,
): Promise<ToolResult> {
  if (!input.target.trim()) {
    return { success: false, error: "proposal `target` is required." };
  }
  if (!input.summary.trim()) {
    return { success: false, error: "proposal `summary` is required." };
  }

  const { data, error } = await ctx.supabase
    .from("katie_proposals")
    .insert({
      bloombot_id: ctx.botId,
      proposed_by: ctx.userId,
      kind: input.kind,
      target: input.target.trim(),
      summary: input.summary.trim(),
      details: input.details?.trim() || null,
      suggested_diff: input.suggested_diff?.trim() || null,
      status: "open",
    })
    .select("id, status, kind, target, summary")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: `Failed to file proposal: ${error?.message ?? "unknown"}`,
    };
  }

  const row = data as {
    id: string;
    status: string;
    kind: string;
    target: string;
    summary: string;
  };
  return {
    success: true,
    data: {
      proposal_id: row.id,
      status: row.status,
      kind: row.kind,
      target: row.target,
      summary: row.summary,
      next_step:
        "Visible in the admin proposals queue. A dev will mark it accepted/rejected before any code lands.",
    },
  };
}

async function proposeModuleChange(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const moduleId =
    typeof args.module_id === "string" && args.module_id.trim().length > 0
      ? args.module_id.trim()
      : null;
  if (!moduleId) {
    return {
      success: false,
      error: "propose_module_change needs `module_id` (e.g. 'progress').",
    };
  }

  // Validate the module exists so proposals aren't filed against typos.
  const modules = await getActiveModulesLazy();
  if (!modules.find((m) => m.id === moduleId)) {
    return {
      success: false,
      error: `Unknown module_id: ${moduleId}. Use read_module_registry for the full list.`,
    };
  }

  return insertProposal(ctx, {
    kind: "module_change",
    target: `module:${moduleId}`,
    summary: typeof args.summary === "string" ? args.summary : "",
    details: typeof args.details === "string" ? args.details : null,
    suggested_diff:
      typeof args.suggested_diff === "string" ? args.suggested_diff : null,
  });
}

async function proposeSchemaChange(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const table =
    typeof args.table === "string" && args.table.trim().length > 0
      ? args.table.trim()
      : null;
  if (!table) {
    return {
      success: false,
      error: "propose_schema_change needs `table` (e.g. 'bapp_logs').",
    };
  }

  return insertProposal(ctx, {
    kind: "schema_change",
    target: `table:${table}`,
    summary: typeof args.summary === "string" ? args.summary : "",
    details: typeof args.details === "string" ? args.details : null,
    suggested_diff:
      typeof args.suggested_diff === "string" ? args.suggested_diff : null,
  });
}

async function readProposals(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const statusArg = typeof args.status === "string" ? args.status : null;
  const kindArg = typeof args.kind === "string" ? args.kind : null;
  const target = typeof args.target === "string" ? args.target.trim() : null;
  const limit = Math.min(
    100,
    Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 30),
  );

  let query = ctx.supabase.from("katie_proposals").select();
  if (
    statusArg &&
    (PROPOSAL_STATUSES as readonly string[]).includes(statusArg)
  ) {
    query = query.eq("status", statusArg);
  }
  if (kindArg && (PROPOSAL_KINDS as readonly string[]).includes(kindArg)) {
    query = query.eq("kind", kindArg);
  }
  if (target) {
    query = query.eq("target", target);
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      success: false,
      error: `Failed to read proposals: ${error.message}`,
    };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    kind: string;
    target: string;
    summary: string;
    details: string | null;
    suggested_diff: string | null;
    status: string;
    reviewer_notes: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;

  return {
    success: true,
    data: {
      count: rows.length,
      proposals: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        target: r.target,
        summary: r.summary,
        status: r.status,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
        reviewer_notes: r.reviewer_notes,
        has_details: Boolean(r.details),
        has_suggested_diff: Boolean(r.suggested_diff),
      })),
    },
  };
}

async function updateProposalStatus(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const id =
    typeof args.id === "string" && args.id.trim().length > 0
      ? args.id.trim()
      : null;
  if (!id) {
    return { success: false, error: "update_proposal_status needs `id`." };
  }
  const status = typeof args.status === "string" ? args.status : null;
  if (!status || !(PROPOSAL_STATUSES as readonly string[]).includes(status)) {
    return {
      success: false,
      error: `status must be one of ${PROPOSAL_STATUSES.join(", ")}.`,
    };
  }
  const reviewerNotes =
    typeof args.reviewer_notes === "string" &&
    args.reviewer_notes.trim().length > 0
      ? args.reviewer_notes.trim()
      : null;

  const patch: Record<string, unknown> = {
    status,
    reviewer_notes: reviewerNotes,
    reviewed_by: ctx.userId,
    reviewed_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.supabase
    .from("katie_proposals")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: `Failed to update proposal: ${error?.message ?? "not found"}`,
    };
  }

  return {
    success: true,
    data: { id, status: (data as { status: string }).status },
  };
}

async function readToolSurface(
  _args: Record<string, unknown>,
  _ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const modules = await getActiveModulesLazy();
  const tools: Array<{
    name: string;
    module_id: string;
    description: string;
  }> = [];
  for (const m of modules) {
    for (const t of m.tools) {
      tools.push({
        name: t.name,
        module_id: m.id,
        description: t.description,
      });
    }
  }
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return {
    success: true,
    data: { count: tools.length, tools },
  };
}

export const katieAdminModule: BloomBotModule = {
  id: "katie-admin",
  name: "Katie Admin (inspection)",
  description:
    "Admin-only inspection of Katie's own configuration: current prompt sections, registered modules, tool surface. Editing tools land in a follow-up sprint — use this set to see what's live before proposing changes.",

  rolesAllowed: ["admin"],

  tools: [
    {
      name: "read_all_prompt_sections",
      description:
        "List every active prompt section with metadata (version, protected flag, size, last updated). Use this before read_prompt_section so you know what's available.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_prompt_section",
      description:
        "Return the full content of a named prompt section as currently deployed.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "Section id (e.g. 'identity', 'voice', 'boundaries', 'role_nanny', 'module.feed').",
          },
        },
        required: ["section"],
      },
    },
    {
      name: "read_module_registry",
      description:
        "List every module Katie currently has loaded, with tool counts and role scoping.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_module_definition",
      description:
        "Return full details for one module — description, tools with parameters, rolesAllowed, systemPromptFragment.",
      parameters: {
        type: "object",
        properties: {
          module_id: {
            type: "string",
            description:
              "Module id (e.g. 'child-profile', 'progress', 'agent-memory').",
          },
        },
        required: ["module_id"],
      },
    },
    {
      name: "read_tool_surface",
      description:
        "Return every tool exposed to Gemini right now, sorted by name, each tagged with its owning module id.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "propose_prompt_edit",
      description:
        "Preview a prompt edit without applying it. Returns a unified line diff + char counts + whether the section is protected. Always call this first; then apply_prompt_edit with the same args to commit.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "Section id from read_all_prompt_sections (e.g. 'identity', 'module.feed').",
          },
          new_content: {
            type: "string",
            description: "Proposed replacement content for the section.",
          },
        },
        required: ["section", "new_content"],
      },
    },
    {
      name: "apply_prompt_edit",
      description:
        "Commit a prompt edit. Deactivates the current version, inserts a new one at version+1, writes an audit row in katie_prompt_edits. Requires `reason`. Protected sections require `confirm_protected=true`. Rate-limited to 20 edits per hour per admin.",
      parameters: {
        type: "object",
        properties: {
          section: { type: "string" },
          new_content: { type: "string" },
          reason: {
            type: "string",
            description: "Short explanation of why — stored in the audit log.",
          },
          confirm_protected: {
            type: "boolean",
            description:
              "Required=true for sections flagged protected. Fails otherwise.",
          },
        },
        required: ["section", "new_content", "reason"],
      },
    },
    {
      name: "rollback_prompt_edit",
      description:
        "Undo a previously-applied edit. Finds the edit by id, restores its before_content as a new active version, and links the two edits so the audit chain is traceable.",
      parameters: {
        type: "object",
        properties: {
          edit_id: {
            type: "string",
            description: "id of the katie_prompt_edits row to revert.",
          },
          reason: { type: "string" },
        },
        required: ["edit_id", "reason"],
      },
    },
    {
      name: "propose_module_change",
      description:
        "File a proposal for a module code change — add/rename/remove a tool, change validation, add a proactive trigger, etc. Lands in the admin proposals queue for dev review; code doesn't ship until a human accepts. Use when prompt-only changes won't cut it.",
      parameters: {
        type: "object",
        properties: {
          module_id: {
            type: "string",
            description:
              "Module the change concerns (e.g. 'progress', 'diary').",
          },
          summary: {
            type: "string",
            description: "One-line change description.",
          },
          details: {
            type: "string",
            description:
              "Longer explanation — motivation, behaviour change, edge cases.",
          },
          suggested_diff: {
            type: "string",
            description: "Optional code snippet. Plain text ok.",
          },
        },
        required: ["module_id", "summary"],
      },
    },
    {
      name: "propose_schema_change",
      description:
        "File a proposal for a database schema change (new table/column/index/constraint, RLS tweak). Schema changes ship via a migration file; this just queues the request for dev review.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name concerned." },
          summary: { type: "string" },
          details: { type: "string" },
          suggested_diff: {
            type: "string",
            description: "Optional SQL DDL snippet.",
          },
        },
        required: ["table", "summary"],
      },
    },
    {
      name: "read_proposals",
      description:
        "List proposals in the queue. Filter by status / kind / target. Default returns all, newest first.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "accepted", "rejected", "implemented"],
          },
          kind: {
            type: "string",
            enum: ["module_change", "schema_change", "prompt_change", "other"],
          },
          target: { type: "string" },
          limit: { type: "number" },
        },
        required: [],
      },
    },
    {
      name: "update_proposal_status",
      description:
        "Mark a proposal accepted / rejected / implemented. Used during review of the admin queue. Stamps reviewer_notes + reviewed_by.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: {
            type: "string",
            enum: ["open", "accepted", "rejected", "implemented"],
          },
          reviewer_notes: { type: "string" },
        },
        required: ["id", "status"],
      },
    },
    {
      name: "read_system_inventory",
      description:
        "Read the generated system manifest — routes, pages, crons, migrations, server-action files. Call once with no `section` to see summary + the list of sections; then drill in. Use before proposing changes so you know what exists and what's named what.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: [
              "summary",
              "routes",
              "pages",
              "crons",
              "migrations",
              "server_actions",
            ],
            description: "Which manifest section to return. Omit for overview.",
          },
          match: {
            type: "string",
            description:
              "Optional substring filter (case-insensitive) applied to every row.",
          },
          limit: {
            type: "number",
            description: "Max rows (default 200, max 500).",
          },
        },
        required: [],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_all_prompt_sections")
      return readAllPromptSections(args, ctx);
    if (toolName === "read_prompt_section") return readPromptSection(args, ctx);
    if (toolName === "read_module_registry")
      return readModuleRegistry(args, ctx);
    if (toolName === "read_module_definition")
      return readModuleDefinition(args, ctx);
    if (toolName === "read_tool_surface") return readToolSurface(args, ctx);
    if (toolName === "propose_prompt_edit") return proposePromptEdit(args, ctx);
    if (toolName === "apply_prompt_edit") return applyPromptEdit(args, ctx);
    if (toolName === "rollback_prompt_edit")
      return rollbackPromptEdit(args, ctx);
    if (toolName === "propose_module_change")
      return proposeModuleChange(args, ctx);
    if (toolName === "propose_schema_change")
      return proposeSchemaChange(args, ctx);
    if (toolName === "read_proposals") return readProposals(args, ctx);
    if (toolName === "update_proposal_status")
      return updateProposalStatus(args, ctx);
    if (toolName === "read_system_inventory")
      return readSystemInventory(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "You're in admin mode. When the operator asks about your own behaviour, inspect before guessing: `read_all_prompt_sections` for the index, `read_prompt_section` for a specific section, `read_module_registry` / `read_module_definition` / `read_tool_surface` for modules and tools, `read_system_inventory` for routes/pages/crons/migrations/server actions. For prompt edits: always `propose_prompt_edit` first and show the operator the diff; only `apply_prompt_edit` once they confirm. Protected sections require `confirm_protected=true` in apply — ask explicitly. For mistakes, `rollback_prompt_edit` by edit id. For bigger changes (module code / schema / new table) use `propose_module_change` or `propose_schema_change` — those go to the dev queue rather than shipping directly. Quote exact versions and literal content back — precision matters when the operator is about to change something.",
};
