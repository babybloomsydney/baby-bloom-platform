/**
 * BloomBot module registry.
 *
 * Importing a new module here + adding it to ALL_MODULES is the ONLY
 * change needed to expose its tools to Katie. Everything else is
 * orchestrated by the chat route, dispatcher, and prompt builder.
 */

import type { BloomBotModule, ToolDefinition, ProactiveTrigger } from "./types";
import type { BotRole } from "@/lib/ai/model-selector";
import type { BotSettings } from "@/types/bapp";

// ── Module imports ──────────────────────────────────────────────────────
// Phase 1 ships with 2 read-only modules. Phase 2 adds write modules +
// memory + proactive. Phase 3 adds admin. Phase 4 adds pan-site modules.

import { childProfileModule } from "./child-profile";
import { feedModule } from "./feed";
import { progressModule } from "./progress";
import { diaryModule } from "./diary";
import { observationsModule } from "./observations";
import { activitiesModule } from "./activities";
import { feedWriterModule } from "./feed-writer";
import { agentMemoryModule } from "./agent-memory";
import { historyModule } from "./history";
import { katieSchedulingModule } from "./katie-scheduling";
import { katieAdminModule } from "./katie-admin";
import { verificationModule } from "./verification";
import { connectionsModule } from "./connections";
import { profileModule } from "./profile";
import { bsrModule } from "./bsr";
import { jobSearchModule } from "./job-search";
import { onboardingModule } from "./onboarding";
import { childOnboardingModule } from "./child-onboarding";

// ── Registry ────────────────────────────────────────────────────────────

const ALL_MODULES: BloomBotModule[] = [
  childProfileModule,
  feedModule,
  progressModule,
  diaryModule,
  observationsModule,
  activitiesModule,
  feedWriterModule,
  agentMemoryModule,
  historyModule,
  katieSchedulingModule,
  katieAdminModule,
  verificationModule,
  connectionsModule,
  profileModule,
  bsrModule,
  jobSearchModule,
  onboardingModule,
  childOnboardingModule,
  // Future:
  //   insightsModule
];

// ── Role + per-bot filtering ────────────────────────────────────────────
//
// Filtering happens in two passes:
//   1. Static filter — `enabled` flag + `rolesAllowed` allowlist. Always
//      runs. Caller may pass a role or not.
//   2. Dynamic filter — `enabledForBot(settings)` predicate. Only runs
//      when the caller supplies bot settings. Without settings, this pass
//      is skipped entirely so legacy callers (registry tests, admin tools
//      that operate without a specific bot) keep their previous behaviour.
//
// The Gemini cache key already factors in the tool list (see
// gemini-cache-manager.ts compositeHash) so a tool set that shrinks when
// `enabledForBot` removes a module produces a different composite hash —
// no separate cache-key suffix needed. The static prompt does NOT have
// the same automatic guarantee (versionHash comes from katie_prompt only),
// so callers who care about prompt-text differences (i.e. buildStaticPrompt
// in context.ts) must derive a per-bot fingerprint themselves.

function isModuleAllowedForRole(m: BloomBotModule, role?: BotRole): boolean {
  if (m.enabled === false) return false;
  if (!m.rolesAllowed || m.rolesAllowed.length === 0) return true;
  if (!role) return true; // caller didn't specify — include everything
  return m.rolesAllowed.includes(role);
}

function isModuleAllowedForBot(
  m: BloomBotModule,
  settings: BotSettings | undefined,
): boolean {
  if (!m.enabledForBot) return true;
  if (!settings) return true; // no bot context — defer to other filters
  return m.enabledForBot(settings);
}

/**
 * Returns all modules applicable to the given role + bot settings. Both
 * arguments are optional. When a caller has bot context (the chat route,
 * the proactive dispatcher), passing settings lets dynamic predicates
 * gate modules per-bot; when a caller doesn't (admin tools, registry
 * smoke tests), omitting settings preserves the existing behaviour.
 */
export function getActiveModules(
  role?: BotRole,
  settings?: BotSettings,
): BloomBotModule[] {
  return ALL_MODULES.filter(
    (m) =>
      isModuleAllowedForRole(m, role) && isModuleAllowedForBot(m, settings),
  );
}

/**
 * Collects all tool definitions from active modules. Pass this to Gemini
 * as the `tools` field.
 *
 * When `settings` is provided, modules whose `enabledForBot` predicate
 * returns false are excluded — their tools are NOT given to Gemini.
 * This is how the `update_onboarding_state` tool disappears once a bot
 * has finished the A-08 cascade.
 */
export function collectTools(
  role?: BotRole,
  settings?: BotSettings,
): ToolDefinition[] {
  return getActiveModules(role, settings).flatMap((m) => m.tools);
}

/**
 * Collects fallback system prompt fragments (used when katie_prompt has
 * no `module.<id>` row — otherwise the DB content takes precedence via
 * the context loader).
 */
export function collectSystemPromptFragments(
  role?: BotRole,
  settings?: BotSettings,
): string[] {
  return getActiveModules(role, settings)
    .map((m) => m.systemPromptFragment)
    .filter(Boolean) as string[];
}

/** Collects all proactive triggers from active modules. */
export function collectProactiveTriggers(
  role?: BotRole,
  settings?: BotSettings,
): ProactiveTrigger[] {
  return getActiveModules(role, settings).flatMap(
    (m) => m.proactiveTriggers ?? [],
  );
}

/**
 * Finds the module owning a given tool name, respecting role filtering
 * and the optional per-bot predicate. Returns null if no module
 * defines the tool (unknown tool call = error).
 *
 * Defense in depth: even if Gemini submits a function call for a tool
 * that was filtered out via `enabledForBot` (e.g. from a stale cache
 * built before the bot's onboarding completed), this guard refuses
 * to route the call. Pass `settings` here whenever the caller has it.
 */
export function findToolHandler(
  toolName: string,
  role?: BotRole,
  settings?: BotSettings,
): BloomBotModule | null {
  return (
    getActiveModules(role, settings).find((m) =>
      m.tools.some((t) => t.name === toolName),
    ) ?? null
  );
}

/** Finds a specific proactive trigger by id. Pass `settings` to honour
 *  per-bot module gating; without settings the predicate is skipped. */
export function findProactiveTrigger(
  triggerId: string,
  role?: BotRole,
  settings?: BotSettings,
): { module: BloomBotModule; trigger: ProactiveTrigger } | null {
  for (const m of getActiveModules(role, settings)) {
    const t = m.proactiveTriggers?.find((pt) => pt.id === triggerId);
    if (t) return { module: m, trigger: t };
  }
  return null;
}
