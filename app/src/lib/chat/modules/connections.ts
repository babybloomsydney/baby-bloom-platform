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
  declineConnectionRequest,
  cancelConnectionRequest,
  type ConnectionRequestWithDetails,
} from "@/lib/actions/connection";
import { CONNECTION_STAGE } from "@/lib/position/constants";
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

// ── Writes — two-turn confirm (propose → apply) ──────────────────────────

/**
 * Shared resolver — load the caller's connections, find the one by id,
 * return { connection, role } or an error. All write handlers start
 * here so the role gate + ownership check are consistent and the
 * failure modes produce the same user-safe error text.
 */
async function resolveConnectionForWrite(
  connectionId: unknown,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<
  | { ok: true; role: ConnectionRole; connection: ConnectionRequestWithDetails }
  | { ok: false; error: string }
> {
  if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
    return {
      ok: false,
      error: "Pass the `connection_id` of the connection to act on.",
    };
  }

  const role = resolveRole(ctx.effectiveRole);
  if (!role) {
    return {
      ok: false,
      error:
        "Connections are only available for nanny and parent accounts. Admin views use the admin inspection tools.",
    };
  }

  const { list, error } = await loadConnections(role);
  if (error) return { ok: false, error };

  const connection = list.find((r) => r.id === connectionId.trim());
  if (!connection) {
    return {
      ok: false,
      error: `No connection found with id "${connectionId}". Use read_connection_by_name or read_connection_inbox to find the right id.`,
    };
  }

  return { ok: true, role, connection };
}

/**
 * Decline — propose.
 * Nanny-only; only valid while the request is still pending (stages
 * REQUEST_SENT / NANNY_APPLIED_PENDING / ACCEPTED_PENDING). Does NOT
 * hit the server action — just previews what would happen so Katie can
 * read it back to the user and wait for explicit confirmation.
 */
async function proposeDeclineConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "nanny") {
    return {
      success: false,
      error:
        "Only nannies can decline a connection. As the parent, use cancel if you want to withdraw the request instead.",
    };
  }

  const stage = connection.connection_stage;
  const declinable =
    stage === CONNECTION_STAGE.REQUEST_SENT ||
    stage === CONNECTION_STAGE.NANNY_APPLIED_PENDING ||
    stage === CONNECTION_STAGE.ACCEPTED_PENDING;
  if (!declinable) {
    return {
      success: false,
      error:
        "This request is no longer in the pending stage — decline isn't available. If you want to step away, use cancel instead.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  const reason =
    typeof args.reason === "string" && args.reason.trim().length > 0
      ? args.reason.trim()
      : null;

  return {
    success: true,
    data: {
      action: "decline",
      connection_id: connection.id,
      counterparty_name: displayName,
      has_reason: reason !== null,
      email_side_effect: true,
      preview: `You're about to decline the connection request from ${displayName}. The family will get a neutral notification — we never share the reason you give us (it's kept in our records only).`,
      next_call:
        "Read this back to the user and ask 'yes / cancel'. When they confirm, call apply_decline_connection with the same connection_id (and reason if they provided one).",
    },
  };
}

/**
 * Decline — apply. Wraps declineConnectionRequest().
 */
async function applyDeclineConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "nanny") {
    return {
      success: false,
      error:
        "Only nannies can decline a connection. This shouldn't have been called — re-check the propose step.",
    };
  }

  const reason =
    typeof args.reason === "string" && args.reason.trim().length > 0
      ? args.reason.trim()
      : undefined;

  const result = await declineConnectionRequest(connection.id, reason);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to decline connection.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "decline",
      connection_id: connection.id,
      counterparty_name: displayName,
      message: `Declined. ${displayName} will get a neutral notification — nothing about a specific reason.`,
    },
    // Emit the live tile so the UI reflects the new terminal state.
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
    },
  };
}

/**
 * Cancel — propose.
 * Either side can cancel any active (non-terminal, non-cancelled)
 * connection. Previews the action without hitting the server.
 */
async function proposeCancelConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (connection.status === "cancelled") {
    return {
      success: false,
      error: "This connection has already been cancelled.",
    };
  }
  if (isTerminal(connection.connection_stage)) {
    return {
      success: false,
      error:
        "This connection is already closed — cancel isn't available. If you want to start something new, send a fresh request.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  const otherPartyNotice =
    role === "parent"
      ? `${displayName} will be notified in their inbox.`
      : `The family will be notified in their inbox.`;

  return {
    success: true,
    data: {
      action: "cancel",
      connection_id: connection.id,
      counterparty_name: displayName,
      email_side_effect: false,
      preview: `You're about to cancel your connection with ${displayName}. ${otherPartyNotice} You can send a new request later if you change your mind.`,
      next_call:
        "Read this back to the user and ask 'yes / cancel'. When they confirm, call apply_cancel_connection with the same connection_id.",
    },
  };
}

/**
 * Cancel — apply. Wraps cancelConnectionRequest().
 */
async function applyCancelConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  const result = await cancelConnectionRequest(connection.id);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to cancel connection.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "cancel",
      connection_id: connection.id,
      counterparty_name: displayName,
      message: `Cancelled. ${displayName} will see this in their inbox.`,
    },
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
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
    {
      name: "propose_decline_connection",
      description:
        "Preview declining a connection request (nanny only; request must still be pending). Returns the user-facing wording to read back to the user and wait for yes/cancel. Does NOT hit the server. Always call this first, never apply_decline_connection directly.",
      parameters: {
        type: "object",
        properties: {
          connection_id: {
            type: "string",
            description:
              "The connection id (returned by read_connection_by_name / read_connection_inbox).",
          },
          reason: {
            type: "string",
            description:
              "Optional private reason — stored in our records, never shared with the family.",
          },
        },
        required: ["connection_id"],
      },
    },
    {
      name: "apply_decline_connection",
      description:
        "Actually decline the connection request. Only call after propose_decline_connection and after the user has explicitly confirmed. Sends a neutral notification email to the family (INT-004) — no reason shared with them.",
      parameters: {
        type: "object",
        properties: {
          connection_id: {
            type: "string",
            description:
              "Same connection id passed to propose_decline_connection.",
          },
          reason: {
            type: "string",
            description:
              "Same optional reason passed to propose_decline_connection (stored internally only).",
          },
        },
        required: ["connection_id"],
      },
    },
    {
      name: "propose_cancel_connection",
      description:
        "Preview cancelling a connection (either side can cancel an active connection). Returns the user-facing wording to read back plus a note that the other party will be notified. Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          connection_id: {
            type: "string",
            description: "The connection id to cancel.",
          },
        },
        required: ["connection_id"],
      },
    },
    {
      name: "apply_cancel_connection",
      description:
        "Actually cancel the connection. Only call after propose_cancel_connection and explicit user confirmation. Sends an inbox notification to the other party (no email).",
      parameters: {
        type: "object",
        properties: {
          connection_id: {
            type: "string",
            description:
              "Same connection id passed to propose_cancel_connection.",
          },
        },
        required: ["connection_id"],
      },
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
    if (toolName === "propose_decline_connection")
      return proposeDeclineConnection(args, ctx);
    if (toolName === "apply_decline_connection")
      return applyDeclineConnection(args, ctx);
    if (toolName === "propose_cancel_connection")
      return proposeCancelConnection(args, ctx);
    if (toolName === "apply_cancel_connection")
      return applyCancelConnection(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "For anything about the user's connections / meet-and-greet pipeline / who they're talking to, call the read tools below. Hard rules:\n\n" +
    "• NEVER say 'intro', 'intro call', or 'interview' — always 'meet and greet'. The legacy 'interview request' label has been renamed; it's a 'connection' or 'request' now.\n" +
    "• NEVER speak the words 'connection_request', 'connection_stage', stage numbers, 'fill_initiated_by', 'proposed_times', or any other internal field. The read tools already return plain English — surface their output directly.\n\n" +
    "Reads:\n" +
    "• 'Who wants to interview me?' / 'who have I reached out to?' → `read_connection_inbox`. Narrate the active list — do NOT emit a tile per connection; one tile per reply max. If the user picks one, follow up with `read_connection_by_name` which emits an interactive tile for just that one.\n" +
    "• User names a specific counterparty → `read_connection_by_name`. If match_count > 1, ask which one before proceeding.\n" +
    "• 'When is my meet?' → `read_upcoming_meet` and read the `confirmed_time` in Sydney time plus the nanny phone (only if the tool returned one — don't paraphrase if absent).\n" +
    "• 'What do I need to do?' / 'anything outstanding?' → `read_action_required`.\n" +
    "• Never fabricate a counterparty name — only use names returned by the tools.\n\n" +
    "Writes (available: decline, cancel — accept/schedule/outcome reporting not yet wired):\n" +
    "• Every write is TWO TURNS. Turn 1: call `propose_<action>`, read the returned `preview` back to the user verbatim, ask yes/cancel. Turn 2: only if the user says yes, call `apply_<action>` with the same args. NEVER call apply_ directly without a propose_ preceding it in the same conversation.\n" +
    "• If the user says anything other than a clear affirmative (yes, confirm, go ahead, do it, proceed), DO NOT call apply_. Ask once more for a clear yes/cancel.\n" +
    "• If a write returns an error, surface the error text verbatim — it is already user-safe. Do not silently retry.\n" +
    "• If the user asks to accept, schedule, or report an outcome (actions not yet wired), tell them that flow still lives on the main inbox page and offer to open the connection tile so they can act from there.\n" +
    "• Decline is nanny-only and only while the request is still pending. Cancel is available to either side for any active (non-terminal) connection. The propose step enforces those gates with a user-safe error if the action isn't allowed.",
};
