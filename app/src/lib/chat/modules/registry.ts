/**
 * BloomBot module registry.
 *
 * Importing a new module here + adding it to ALL_MODULES is the ONLY
 * change needed to expose its tools to Katie. Everything else is
 * orchestrated by the chat route, dispatcher, and prompt builder.
 */

import type { BloomBotModule, ToolDefinition, ProactiveTrigger } from "./types";
import type { BotRole } from "@/lib/ai/model-selector";

// ── Module imports ──────────────────────────────────────────────────────
// Phase 1 ships with 2 read-only modules. Phase 2 adds write modules +
// memory + proactive. Phase 3 adds admin. Phase 4 adds pan-site modules.

import { childProfileModule } from "./child-profile";
import { feedModule } from "./feed";
import { progressModule } from "./progress";

// ── Registry ────────────────────────────────────────────────────────────

const ALL_MODULES: BloomBotModule[] = [
  childProfileModule,
  feedModule,
  progressModule,
  // Future:
  //   observationsModule, diaryModule, activitiesModule,
  //   agentMemoryModule, feedWriterModule, insightsModule, katieSchedulingModule,
  //   katieAdminModule (admin-only), jobSearchModule, bsrModule,
  //   verificationModule, profileModule, connectionsModule
];

// ── Role filtering ──────────────────────────────────────────────────────

function isModuleAllowedForRole(m: BloomBotModule, role?: BotRole): boolean {
  if (m.enabled === false) return false;
  if (!m.rolesAllowed || m.rolesAllowed.length === 0) return true;
  if (!role) return true; // caller didn't specify — include everything
  return m.rolesAllowed.includes(role);
}

/**
 * Returns all modules applicable to the given role (or all modules if
 * role is not provided). Filters out disabled modules.
 */
export function getActiveModules(role?: BotRole): BloomBotModule[] {
  return ALL_MODULES.filter((m) => isModuleAllowedForRole(m, role));
}

/**
 * Collects all tool definitions from active modules. Pass this to Gemini
 * as the `tools` field.
 */
export function collectTools(role?: BotRole): ToolDefinition[] {
  return getActiveModules(role).flatMap((m) => m.tools);
}

/**
 * Collects fallback system prompt fragments (used when katie_prompt has
 * no `module.<id>` row — otherwise the DB content takes precedence via
 * the context loader).
 */
export function collectSystemPromptFragments(role?: BotRole): string[] {
  return getActiveModules(role)
    .map((m) => m.systemPromptFragment)
    .filter(Boolean) as string[];
}

/** Collects all proactive triggers from active modules. */
export function collectProactiveTriggers(role?: BotRole): ProactiveTrigger[] {
  return getActiveModules(role).flatMap((m) => m.proactiveTriggers ?? []);
}

/**
 * Finds the module owning a given tool name, respecting role filtering.
 * Returns null if no module defines the tool (unknown tool call = error).
 */
export function findToolHandler(
  toolName: string,
  role?: BotRole,
): BloomBotModule | null {
  return (
    getActiveModules(role).find((m) =>
      m.tools.some((t) => t.name === toolName),
    ) ?? null
  );
}

/** Finds a specific proactive trigger by id. */
export function findProactiveTrigger(
  triggerId: string,
  role?: BotRole,
): { module: BloomBotModule; trigger: ProactiveTrigger } | null {
  for (const m of getActiveModules(role)) {
    const t = m.proactiveTriggers?.find((pt) => pt.id === triggerId);
    if (t) return { module: m, trigger: t };
  }
  return null;
}
