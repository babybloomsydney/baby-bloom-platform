/**
 * Prompt-as-data loader + system prompt builder.
 *
 * Reads prompt sections from the `katie_prompt` table and assembles the
 * full system prompt at request time.
 *
 * Serverless-safe cache invalidation:
 *   - A singleton `katie_prompt_version` table holds a UUID version_hash.
 *   - Writes to `katie_prompt` bump the hash via trigger.
 *   - This loader SELECTs the hash on every request (sub-5ms, single-row
 *     PK lookup). If the hash matches the worker's cached value, use the
 *     cache; otherwise reload.
 *   - No cross-worker coordination required.
 *
 * See system/APP/BLOOMBOT/ARCHITECTURE.md "Prompt-as-Data Loading" section.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { BotRole } from "@/lib/ai/model-selector";
import { getActiveModules } from "@/lib/chat/modules/registry";

// ── Types ────────────────────────────────────────────────────────────────────

export type PromptSectionId =
  | "identity"
  | "voice"
  | "boundaries"
  | "data_surfaces"
  | "proactive_rules"
  | "logging_rules"
  | "scheduling_constraints"
  | "role_nanny"
  | "role_parent"
  | "role_admin"
  | `module.${string}`;

export interface PromptSection {
  section: PromptSectionId;
  content: string;
  version: number;
  protected: boolean;
}

export interface ChildSummary {
  id: string;
  firstName: string;
  ageMonths: number;
  ageBracket: string;
  gender: string | null;
}

export interface CurrentSurface {
  route: string;
  feature: string;
  viewing?: { type: string; id: string } | null;
}

export interface BotContext {
  botId: string;
  userId: string;
  role: BotRole;
  effectiveRole: BotRole;
  userName: string;
  children: ChildSummary[];
  currentSurface?: CurrentSurface | null;
  /** Pre-rendered memory table (from memory/context-builder — Phase 2). Null in Phase 1. */
  memoryTable?: string | null;
}

// ── Worker-local cache ───────────────────────────────────────────────────────

interface CacheEntry {
  hash: string;
  sections: Map<string, PromptSection>;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

/** Test-only: reset the worker cache between tests. */
export function __resetPromptCache(): void {
  cache = null;
}

// ── DB ───────────────────────────────────────────────────────────────────────

async function fetchVersionHash(): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("katie_prompt_version")
    .select("version_hash")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `Failed to fetch katie_prompt_version: ${error?.message ?? "no row"}`,
    );
  }
  return data.version_hash as string;
}

async function fetchActiveSections(): Promise<Map<string, PromptSection>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("katie_prompt")
    .select("section, content, version, protected")
    .eq("is_active", true);
  if (error) {
    throw new Error(`Failed to fetch katie_prompt: ${error.message}`);
  }
  const map = new Map<string, PromptSection>();
  for (const row of data ?? []) {
    map.set(row.section as string, row as PromptSection);
  }
  return map;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Loads prompt sections, using worker-local cache when the version hash matches.
 * Safe across Vercel serverless workers — each worker keeps its own cache
 * but all share the DB-stored hash, so invalidation propagates within one
 * DB round-trip.
 */
export async function loadActiveSections(
  sectionIds?: PromptSectionId[],
): Promise<Map<string, PromptSection>> {
  const hash = await fetchVersionHash();

  if (!cache || cache.hash !== hash) {
    const sections = await fetchActiveSections();
    cache = { hash, sections, loadedAt: Date.now() };
  }

  if (!sectionIds) return cache.sections;

  const filtered = new Map<string, PromptSection>();
  for (const id of sectionIds) {
    const s = cache.sections.get(id);
    if (s) filtered.set(id, s);
  }
  return filtered;
}

/**
 * Fallback section content when the DB has no matching row.
 * Kept minimal on purpose — if the DB is empty something is wrong and
 * we want the seed script to run, not patch over missing content.
 */
const FALLBACK_IDENTITY = `You are Katie — the user's personal assistant on Baby Bloom. You are not a chatbot; you are the interface to the platform. Be confident, clear, and concise. See seed-katie-prompt for the full prompt.`;

/**
 * Interpolates {variable} placeholders in section content.
 */
export function interpolate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
}

/**
 * Assembles the full system prompt for a given bot context.
 *
 * Load order (concatenated with `\n\n`):
 *   1. identity
 *   2. voice
 *   3. boundaries
 *   4. logging_rules
 *   5. proactive_rules
 *   6. scheduling_constraints
 *   7. role_{effective_role}
 *   8. module.* fragments (sorted by module id)
 *   9. memory_table (runtime, not from DB)
 *   10. user/children/current-surface/date header (runtime)
 */
export async function buildSystemPrompt(ctx: BotContext): Promise<string> {
  const sectionIds: PromptSectionId[] = [
    "identity",
    "voice",
    "boundaries",
    "data_surfaces",
    "logging_rules",
    "proactive_rules",
    "scheduling_constraints",
    `role_${ctx.effectiveRole}` as PromptSectionId,
  ];

  const sections = await loadActiveSections();
  const parts: string[] = [];

  for (const id of sectionIds) {
    const s = sections.get(id);
    if (s) {
      parts.push(interpolate(s.content, buildVariables(ctx)));
    } else if (id === "identity") {
      // Minimum viable fallback if seed hasn't run
      parts.push(FALLBACK_IDENTITY);
    }
  }

  // Module fragments: prefer DB rows (editable by admin Katie), fall back
  // to each module's own systemPromptFragment when no DB row exists.
  // Deterministic alphabetical order by module id.
  const byModuleId = new Map<string, string>();

  // 1. DB-sourced module.* rows (can be for modules that aren't registered
  //    yet — admin Katie may stage them ahead of release; we still emit).
  for (const [id, s] of sections) {
    if (!id.startsWith("module.")) continue;
    const modId = id.slice("module.".length);
    byModuleId.set(modId, interpolate(s.content, buildVariables(ctx)));
  }

  // 2. Registered modules whose fragment hasn't already been provided by DB.
  for (const mod of getActiveModules(ctx.effectiveRole)) {
    if (byModuleId.has(mod.id)) continue;
    if (mod.systemPromptFragment) {
      byModuleId.set(mod.id, mod.systemPromptFragment);
    }
  }

  const ordered = Array.from(byModuleId.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [, content] of ordered) {
    parts.push(content);
  }

  // Runtime-injected blocks (not stored in katie_prompt)
  parts.push(renderRuntimeHeader(ctx));
  if (ctx.memoryTable) parts.push(ctx.memoryTable);

  return parts.filter(Boolean).join("\n\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildVariables(ctx: BotContext): Record<string, string> {
  const now = new Date();
  return {
    user_name: ctx.userName || "there",
    user_role: ctx.effectiveRole,
    current_date: now.toISOString().slice(0, 10),
    day_of_week: now.toLocaleString("en-AU", { weekday: "long" }),
    current_time: now.toLocaleString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Australia/Sydney",
    }),
  };
}

function renderRuntimeHeader(ctx: BotContext): string {
  const lines: string[] = ["## Today"];
  const now = new Date();
  lines.push(`Date: ${now.toISOString().slice(0, 10)}`);
  lines.push(
    `Day: ${now.toLocaleString("en-AU", { weekday: "long", timeZone: "Australia/Sydney" })}`,
  );
  lines.push(
    `Local time (Sydney): ${now.toLocaleString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Australia/Sydney",
    })}`,
  );
  lines.push("");
  lines.push("## Who You Are Speaking With");
  lines.push(`Name: ${ctx.userName}`);
  lines.push(`Role: ${ctx.effectiveRole}`);

  if (ctx.children.length > 0) {
    lines.push("");
    lines.push("## Children This User Has Access To");
    for (const c of ctx.children) {
      const g = c.gender ? `, ${c.gender}` : "";
      lines.push(`- ${c.firstName} — ${c.ageMonths}mo (${c.ageBracket})${g}`);
    }
  }

  if (ctx.currentSurface) {
    lines.push("");
    lines.push("## Current Surface");
    lines.push(`Route: ${ctx.currentSurface.route}`);
    lines.push(`Feature: ${ctx.currentSurface.feature}`);
    if (ctx.currentSurface.viewing) {
      lines.push(
        `Viewing: ${ctx.currentSurface.viewing.type} (${ctx.currentSurface.viewing.id})`,
      );
    }
  }

  return lines.join("\n");
}
