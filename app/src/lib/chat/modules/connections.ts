/**
 * `connections` module — Katie's view over the connections /
 * meet-and-greet pipeline. Role-aware, translates every internal
 * stage + field into plain English before Katie speaks, never
 * re-implements server logic (wraps existing actions in
 * `@/lib/actions/connection.ts` and `@/lib/actions/position-funnel.ts`).
 *
 * This file is the thin assembly point. The actual implementation is
 * split across three sibling files to stay under the project's
 * 800-line-per-file rule:
 *
 *   - connections-shared.ts   — types, role + counterparty helpers,
 *                               resolveConnectionForWrite, loadConnections
 *   - connections-reads.ts    — 4 read tools (inbox / by_name /
 *                               upcoming_meet / action_required)
 *   - connections-writes.ts   — 7 propose/apply pairs with two-turn
 *                               confirm scaffolding
 *   - connections-translator.ts — stage → plain-English mapping
 *
 * The `connectionsModule` export concatenates the read + write tool
 * lists, routes `execute` via tryExecuteRead → tryExecuteWrite →
 * unknown, and composes the read + write system-prompt fragments with
 * the shared persona header that applies to both halves.
 *
 * Hard rules (from system/APP/BLOOMBOT/modules/connections/katie-scope.md):
 *   1. Never expose internal stage numbers, field names, or enum values
 *      to the user. The translator handles that before Katie sees output.
 *   2. Never say "intro" / "interview" — always "meet and greet". The
 *      legacy `interview_requests` label was renamed to
 *      `connection_requests` platform-wide; they are the same entity.
 *   3. Never surface nanny_phone_shared until stage INTRO_SCHEDULED or
 *      later, parent-side only (API route handles this gate too).
 *   4. Never fabricate a counterparty name — always derive from the
 *      enriched connection data; fail-fast when the join is missing.
 */

import type { BloomBotModule } from "./types";
import {
  readTools,
  tryExecuteRead,
  readSystemPromptFragment,
} from "./connections-reads";
import {
  writeTools,
  tryExecuteWrite,
  writeSystemPromptFragment,
} from "./connections-writes";
import { connectionsTriggers } from "./connections-triggers";

// Persona + language rules that apply to both reads and writes. The
// read / write fragments add their own action-specific guidance.
const personaHeaderFragment =
  "For anything about the user's connections / meet-and-greet pipeline / who they're talking to, call the read tools below. Hard rules:\n\n" +
  "• NEVER say 'intro', 'intro call', or 'interview' — always 'meet and greet'. The legacy 'interview request' label has been renamed; it's a 'connection' or 'request' now.\n" +
  "• NEVER speak the words 'connection_request', 'connection_stage', stage numbers, 'fill_initiated_by', 'proposed_times', or any other internal field. The read tools already return plain English — surface their output directly.\n\n";

export const connectionsModule: BloomBotModule = {
  id: "connections",
  name: "Connections",
  description:
    "Read + write surface for the user's connections with nannies / families — their meet-and-greet pipeline, what each side is waiting on, what's scheduled, and what the user needs to do next. Translates all internal stages and fields into plain English.",

  rolesAllowed: ["nanny", "parent"],

  proactiveTriggers: connectionsTriggers,

  tools: [...readTools, ...writeTools],

  async execute(toolName, args, ctx) {
    const readResult = await tryExecuteRead(toolName, args, ctx);
    if (readResult !== null) return readResult;
    const writeResult = await tryExecuteWrite(toolName, args, ctx);
    if (writeResult !== null) return writeResult;
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    personaHeaderFragment +
    readSystemPromptFragment +
    "\n\n" +
    writeSystemPromptFragment,
};
