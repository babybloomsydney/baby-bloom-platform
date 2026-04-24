/**
 * `connections` module — Katie's read view over the connections /
 * meet-and-greet pipeline.
 *
 * Phase 4B.1 is READ-ONLY. Writes (accept/decline/schedule/cancel) +
 * two-turn-confirm scaffolding land in Phase 4B.2. Everything here
 * wraps existing server actions in `@/lib/actions/connection.ts` — we
 * never re-implement server logic.
 *
 * Hard rules (from system/APP/BLOOMBOT/modules/connections/katie-scope.md):
 *   1. Never expose internal stage numbers, field names, or enum values
 *      to the user. The translator (`./connections-translator.ts`)
 *      converts everything to plain English before Katie sees it.
 *   2. Never say "intro" / "interview" — always "meet and greet".
 *   3. Never surface nanny_phone_shared until stage INTRO_SCHEDULED or
 *      later, parent-side only (API route handles this gate too).
 *   4. Never fabricate a counterparty name — always derive from the
 *      enriched connection data.
 *
 * Tile strategy: reads that zero in on a specific connection
 * (read_connection_by_name, read_upcoming_meet) emit a
 * `connection_request` id-only tile — the tile fetches live itself so
 * there's zero drift between Katie's deck and the main-site inbox.
 * Bulk reads (read_connection_inbox, read_action_required) narrate
 * without tiles to avoid spamming the deck with 3+ tiles per reply.
 */

import type { BloomBotModule, ToolResult } from "./types";
import {
  getNannyConnectionRequests,
  getParentConnectionRequests,
  type ConnectionRequestWithDetails,
} from "@/lib/actions/connection";
import {
  stageHeadline,
  nextStepForUser,
  isTerminal,
  isActionRequired,
  timeLeft,
  counterpartyDisplayName,
  type ConnectionRole,
} from "./connections-translator";

interface ConnectionSummary {
  id: string;
  counterparty_name: string;
  suburb: string | null;
  headline: string;
  next_step: string | null;
  time_left: string | null;
  confirmed_time: string | null;
}

async function loadConnections(
  role: ConnectionRole,
): Promise<{ list: ConnectionRequestWithDetails[]; error: string | null }> {
  const result =
    role === "nanny"
      ? await getNannyConnectionRequests()
      : await getParentConnectionRequests();
  return { list: result.data, error: result.error };
}

function counterpartyFromRequest(
  req: ConnectionRequestWithDetails,
  role: ConnectionRole,
): { firstName: string; lastName: string; suburb: string | null } {
  const party = role === "nanny" ? req.parent : req.nanny;
  return {
    firstName: party?.first_name ?? "Unknown",
    lastName: party?.last_name ?? "",
    suburb: party?.suburb ?? null,
  };
}

function summarise(
  req: ConnectionRequestWithDetails,
  role: ConnectionRole,
): ConnectionSummary {
  const { firstName, lastName, suburb } = counterpartyFromRequest(req, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    id: req.id,
    counterparty_name: displayName,
    suburb,
    headline: stageHeadline(req.connection_stage, role, {
      counterpartyName: displayName,
      fillInitiatedBy: req.fill_initiated_by,
    }),
    next_step: nextStepForUser(req.connection_stage, role, {
      fillInitiatedBy: req.fill_initiated_by,
    }),
    time_left: timeLeft(req.expires_at),
    confirmed_time: req.confirmed_time,
  };
}

function resolveRole(effectiveRole: string): ConnectionRole | null {
  if (effectiveRole === "nanny" || effectiveRole === "parent") {
    return effectiveRole;
  }
  return null;
}

function roleOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "Connections are only available for nanny and parent accounts. Admin views use the admin inspection tools.",
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────

async function readConnectionInbox(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  const { list, error } = await loadConnections(role);
  if (error) return { success: false, error };

  const active = list.filter((r) => !isTerminal(r.connection_stage));
  const summaries = active.map((r) => summarise(r, role));

  return {
    success: true,
    data: {
      role,
      count: summaries.length,
      active_count: summaries.length,
      connections: summaries,
    },
  };
}

async function readConnectionByName(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  const rawName =
    typeof args.counterparty_name === "string"
      ? args.counterparty_name.trim().toLowerCase()
      : "";
  if (rawName.length < 2) {
    return {
      success: false,
      error:
        "Pass a counterparty name (at least 2 characters) to match against nanny or family names.",
    };
  }

  const { list, error } = await loadConnections(role);
  if (error) return { success: false, error };

  const matches = list.filter((r) => {
    const { firstName, lastName } = counterpartyFromRequest(r, role);
    const joined = `${firstName} ${lastName}`.toLowerCase();
    return joined.includes(rawName) || firstName.toLowerCase() === rawName;
  });

  if (matches.length === 0) {
    return {
      success: true,
      data: {
        match_count: 0,
        summary: `No connection found matching "${args.counterparty_name}".`,
      },
    };
  }

  if (matches.length > 1) {
    return {
      success: true,
      data: {
        match_count: matches.length,
        disambiguation: matches.map((r) => summarise(r, role)),
        summary: `Multiple connections match "${args.counterparty_name}" — ask the user which one.`,
      },
    };
  }

  const only = matches[0];
  const summary = summarise(only, role);
  return {
    success: true,
    data: {
      match_count: 1,
      connection: summary,
    },
    tile: {
      kind: "connection_request",
      data: { id: only.id },
    },
  };
}

async function readUpcomingMeet(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  const { list, error } = await loadConnections(role);
  if (error) return { success: false, error };

  const now = Date.now();
  const withFutureMeet = list
    .filter((r) => r.confirmed_time)
    .map((r) => ({ r, ts: new Date(r.confirmed_time as string).getTime() }))
    .filter(({ ts }) => Number.isFinite(ts) && ts > now)
    .sort((a, b) => a.ts - b.ts);

  if (withFutureMeet.length === 0) {
    return {
      success: true,
      data: {
        has_upcoming: false,
        summary: "You don't have any upcoming meet and greets booked.",
      },
    };
  }

  const next = withFutureMeet[0].r;
  const summary = summarise(next, role);
  return {
    success: true,
    data: {
      has_upcoming: true,
      connection: summary,
    },
    tile: {
      kind: "connection_request",
      data: { id: next.id },
    },
  };
}

async function readActionRequired(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  const { list, error } = await loadConnections(role);
  if (error) return { success: false, error };

  const needing = list.filter((r) =>
    isActionRequired(r.connection_stage, role, r.fill_initiated_by),
  );
  const summaries = needing.map((r) => summarise(r, role));

  return {
    success: true,
    data: {
      role,
      count: summaries.length,
      connections: summaries,
    },
  };
}

// ── Module export ─────────────────────────────────────────────────────────

export const connectionsModule: BloomBotModule = {
  id: "connections",
  name: "Connections",
  description:
    "Read-only view of the user's connections with nannies / families — their meet-and-greet pipeline, what each side is waiting on, what's scheduled, and what the user needs to do next. Translates all internal stages and fields into plain English.",

  rolesAllowed: ["nanny", "parent"],

  tools: [
    {
      name: "read_connection_inbox",
      description:
        "List the user's active connections. For nannies: requests received + in-progress meet-and-greets. For parents: requests sent + in-progress candidates. Returns counterparty name, suburb, plain-English stage, next step (if any), time-left until expiry. Skips terminal stages (declined / expired / cancelled / finished). Use for 'who wants to interview me?', 'how many candidates am I talking to?', 'anyone waiting on me?'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "read_connection_by_name",
      description:
        "Find a single connection by counterparty first-name or 'first last' (case-insensitive, substring match). Returns the connection summary + an interactive tile the user can act on. If multiple connections match, returns a disambiguation list so you can ask the user which one.",
      parameters: {
        type: "object",
        properties: {
          counterparty_name: {
            type: "string",
            description:
              "The nanny's or family's first name (and optionally last name / initial) to match, e.g. 'Jessica' or 'Jessica M'.",
          },
        },
        required: ["counterparty_name"],
      },
    },
    {
      name: "read_upcoming_meet",
      description:
        "Return the user's next scheduled meet-and-greet (the soonest confirmed_time in the future). Returns { has_upcoming: false } when nothing is booked.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_action_required",
      description:
        "List every connection where the user specifically needs to do something next (not waiting on the other party). Each entry includes the counterparty name + plain-English action. Use for 'what do I need to do?', 'outstanding actions', 'anything needing my attention?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_connection_inbox")
      return readConnectionInbox(args, ctx);
    if (toolName === "read_connection_by_name")
      return readConnectionByName(args, ctx);
    if (toolName === "read_upcoming_meet") return readUpcomingMeet(args, ctx);
    if (toolName === "read_action_required")
      return readActionRequired(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "For anything about the user's connections / meet-and-greet pipeline / who they're talking to, call the read tools below. Hard rules:\n\n" +
    "• NEVER say 'intro', 'intro call', or 'interview' — always 'meet and greet'. The legacy 'interview request' label has been renamed; it's a 'connection' or 'request' now.\n" +
    "• NEVER speak the words 'connection_request', 'connection_stage', stage numbers, 'fill_initiated_by', 'proposed_times', or any other internal field. The read tools already return plain English — surface their output directly.\n" +
    "• When a user asks 'who wants to interview me?' or similar, call `read_connection_inbox`. Narrate the active list — do NOT emit a tile per connection; one tile per reply max to avoid swamping the deck. If the user picks one, follow up with `read_connection_by_name` which will emit an interactive tile for just that one.\n" +
    "• When the user names a specific counterparty, call `read_connection_by_name`. If match_count > 1, ask which one before proceeding.\n" +
    "• When they ask 'when is my meet / interview?', call `read_upcoming_meet` and read the `confirmed_time` in Sydney time, plus the nanny phone (only if the tool returned one — don't paraphrase if absent).\n" +
    "• When they ask 'what do I need to do?' or 'anything outstanding?', call `read_action_required`.\n" +
    "• Phase 4B.1 is READ-ONLY. If the user asks Katie to accept, decline, schedule, or cancel a connection, tell them the action has to happen on their inbox page for now and offer to open the tile so they can act from there (the tile already includes a 'Open to respond' link).\n" +
    "• Never fabricate a counterparty name — only use names returned by the tools.",
};
