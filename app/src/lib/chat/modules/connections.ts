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
  acceptConnectionRequest,
  scheduleConnectionTime,
  createConnectionRequest,
  type ConnectionRequestWithDetails,
} from "@/lib/actions/connection";
import {
  reportIntroOutcome,
  reportParentOutcome,
  confirmPlacement,
  nannyConfirmPosition,
} from "@/lib/actions/position-funnel";
import { CONNECTION_STAGE } from "@/lib/position/constants";
import {
  BRACKET_KEYS,
  TIME_BRACKETS,
  getBracketForHour,
  type BracketKey,
} from "@/lib/timezone";
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

// ── Accept (nanny, requires 5+ slots across 3+ days and all 4 brackets) ──

const SLOT_REGEX = /^\d{4}-\d{2}-\d{2}_(morning|midday|afternoon|evening)$/;

/**
 * Parses + validates the availability slot list. Returns the set of
 * unique brackets + days so the preview can summarise what the user
 * selected, plus a clear error if any rule is broken.
 */
function parseSlots(
  raw: unknown,
):
  | { ok: true; slots: string[]; brackets: Set<BracketKey>; days: Set<string> }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error:
        "Pass `slots` as an array of strings like ['2026-05-01_morning', '2026-05-01_evening', ...].",
    };
  }
  const slots: string[] = [];
  const brackets = new Set<BracketKey>();
  const days = new Set<string>();
  for (const s of raw) {
    if (typeof s !== "string" || !SLOT_REGEX.test(s)) {
      return {
        ok: false,
        error: `Invalid slot "${String(s)}" — must look like "YYYY-MM-DD_morning" (bracket = morning/midday/afternoon/evening).`,
      };
    }
    const [date, bracket] = s.split("_");
    slots.push(s);
    brackets.add(bracket as BracketKey);
    days.add(date);
  }
  if (slots.length < 5) {
    return {
      ok: false,
      error: `Need at least 5 slots — got ${slots.length}.`,
    };
  }
  if (brackets.size < BRACKET_KEYS.length) {
    const missing = BRACKET_KEYS.filter((b) => !brackets.has(b));
    return {
      ok: false,
      error: `Need at least one slot in every bracket (Morning / Midday / Afternoon / Evening). Missing: ${missing.join(", ")}.`,
    };
  }
  if (days.size < 3) {
    return {
      ok: false,
      error: `Need slots across at least 3 different days — got ${days.size}.`,
    };
  }
  return { ok: true, slots, brackets, days };
}

async function proposeAcceptConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "nanny") {
    return {
      success: false,
      error: "Only nannies can accept a connection request.",
    };
  }

  const stage = connection.connection_stage;
  if (
    stage !== CONNECTION_STAGE.REQUEST_SENT &&
    stage !== CONNECTION_STAGE.NANNY_APPLIED_PENDING
  ) {
    return {
      success: false,
      error:
        "This request isn't in the pending stage — it can't be accepted right now.",
    };
  }

  const parsed = parseSlots(args.slots);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);

  // Group slots by day so the preview reads like a human would write it.
  const byDay: Record<string, BracketKey[]> = {};
  for (const slot of parsed.slots) {
    const [date, bracket] = slot.split("_");
    byDay[date] = byDay[date] ?? [];
    byDay[date].push(bracket as BracketKey);
  }
  const dayLines = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([date, bs]) =>
        `${date}: ${bs.map((b) => TIME_BRACKETS[b].label).join(", ")}`,
    );

  return {
    success: true,
    data: {
      action: "accept",
      connection_id: connection.id,
      counterparty_name: displayName,
      slot_count: parsed.slots.length,
      bracket_count: parsed.brackets.size,
      day_count: parsed.days.size,
      slots_by_day: dayLines,
      email_side_effect: true,
      preview: `You're about to accept the connection request from ${displayName} with ${parsed.slots.length} availability slot${parsed.slots.length === 1 ? "" : "s"} across ${parsed.days.size} days. Read these times back so they can double-check:\n${dayLines.map((l) => `- ${l}`).join("\n")}\nOnce accepted, ${displayName} gets a notification and has 3 days to pick one of these times.`,
      next_call:
        "Read the preview + slot list back to the user and wait for 'yes / cancel'. On confirmation, call apply_accept_connection with the SAME connection_id and slots array.",
    },
  };
}

async function applyAcceptConnection(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "nanny") {
    return {
      success: false,
      error: "Only nannies can accept a connection request.",
    };
  }

  const parsed = parseSlots(args.slots);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const result = await acceptConnectionRequest(connection.id, parsed.slots);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to accept connection.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "accept",
      connection_id: connection.id,
      counterparty_name: displayName,
      slot_count: parsed.slots.length,
      message: `Accepted. ${displayName} will be notified with your availability and has 3 days to pick a meet-and-greet time.`,
    },
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
    },
  };
}

// ── Schedule meet time (parent, picks from nanny's proposed_times) ───────

interface ParsedMeetTime {
  date: string;
  hour: number;
  minute: number;
  bracket: BracketKey;
}

function parseMeetTime(
  args: Record<string, unknown>,
): { ok: true; t: ParsedMeetTime } | { ok: false; error: string } {
  const date = typeof args.date === "string" ? args.date.trim() : "";
  const hour = typeof args.hour === "number" ? args.hour : NaN;
  const minute = typeof args.minute === "number" ? args.minute : NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      error: "Pass `date` as an ISO date in Sydney time (YYYY-MM-DD).",
    };
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { ok: false, error: "`hour` must be an integer 0–23." };
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, error: "`minute` must be an integer 0–59." };
  }
  const bracket = getBracketForHour(hour);
  if (!bracket) {
    return {
      ok: false,
      error:
        "Selected time is outside the available window (meet and greets run 8am–8pm Sydney time).",
    };
  }
  const bracketDef = TIME_BRACKETS[bracket];
  if (hour >= bracketDef.endHour) {
    return {
      ok: false,
      error:
        "Selected hour is at the boundary of a bracket — pick a time inside the bracket window (e.g. 8:30 or 10:00 for Morning, not 11:00).",
    };
  }
  return { ok: true, t: { date, hour, minute, bracket } };
}

function formatTimeForPreview(
  date: string,
  hour: number,
  minute: number,
): string {
  // Rough 12h format for preview. The authoritative label comes out of the
  // server action via formatSydneyDate on the UTC-resolved timestamp; here
  // we just need a human-readable preview string.
  const h12 = ((hour + 11) % 12) + 1;
  const am = hour < 12 ? "AM" : "PM";
  const mm = minute.toString().padStart(2, "0");
  return `${date} ${h12}:${mm} ${am} AEST`;
}

async function proposeScheduleMeet(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "parent") {
    return {
      success: false,
      error: "Only parents schedule the meet-and-greet time.",
    };
  }

  if (
    connection.connection_stage !== CONNECTION_STAGE.ACCEPTED &&
    connection.status !== "accepted"
  ) {
    return {
      success: false,
      error:
        "This connection isn't ready to be scheduled — the nanny needs to accept first.",
    };
  }

  const parsed = parseMeetTime(args);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const slotKey = `${parsed.t.date}_${parsed.t.bracket}`;
  if (
    !connection.proposed_times ||
    !connection.proposed_times.includes(slotKey)
  ) {
    return {
      success: false,
      error:
        "The chosen date + bracket isn't one of the nanny's offered slots. Read the nanny's proposed times back (from read_connection_by_name) and pick one that matches.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  const timeStr = formatTimeForPreview(
    parsed.t.date,
    parsed.t.hour,
    parsed.t.minute,
  );

  return {
    success: true,
    data: {
      action: "schedule_meet",
      connection_id: connection.id,
      counterparty_name: displayName,
      scheduled_preview: timeStr,
      email_side_effect: true,
      preview: `You're about to book your meet and greet with ${displayName} for ${timeStr}. When this is confirmed, ${displayName}'s phone number will be shared with you so you can call them at the scheduled time.`,
      next_call:
        "Read the preview back to the user, confirming the date + time. On their 'yes', call apply_schedule_meet with the same connection_id, date, hour, minute.",
    },
  };
}

async function applyScheduleMeet(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (role !== "parent") {
    return {
      success: false,
      error: "Only parents schedule the meet-and-greet time.",
    };
  }

  const parsed = parseMeetTime(args);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const result = await scheduleConnectionTime(
    connection.id,
    parsed.t.date,
    parsed.t.hour,
    parsed.t.minute,
  );
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to schedule connection.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "schedule_meet",
      connection_id: connection.id,
      counterparty_name: displayName,
      message: `Booked! Your meet and greet with ${displayName} is scheduled. Check the connection tile for the confirmed time in Sydney time and ${displayName}'s phone number.`,
    },
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
    },
  };
}

// ── Report outcome (nanny-side + parent-side) ──────────────────────────────

type NannyOutcome = "hired" | "not_hired" | "awaiting" | "trial" | "incomplete";
type ParentOutcome = "hired" | "not_hired" | "awaiting" | "trial";

const NANNY_OUTCOMES: NannyOutcome[] = [
  "hired",
  "not_hired",
  "awaiting",
  "trial",
  "incomplete",
];
const PARENT_OUTCOMES: ParentOutcome[] = [
  "hired",
  "not_hired",
  "awaiting",
  "trial",
];

function outcomeStagesFor(role: ConnectionRole): number[] {
  return [
    CONNECTION_STAGE.INTRO_SCHEDULED,
    CONNECTION_STAGE.INTRO_COMPLETE,
    CONNECTION_STAGE.AWAITING_RESPONSE,
    CONNECTION_STAGE.TRIAL_ARRANGED,
    CONNECTION_STAGE.TRIAL_COMPLETE,
    ...(role === "nanny" ? [CONNECTION_STAGE.INTRO_INCOMPLETE] : []),
  ];
}

function validateOutcome(
  role: ConnectionRole,
  raw: unknown,
):
  | { ok: true; outcome: NannyOutcome | ParentOutcome }
  | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Pass `outcome` as a string." };
  }
  if (role === "nanny" && NANNY_OUTCOMES.includes(raw as NannyOutcome)) {
    return { ok: true, outcome: raw as NannyOutcome };
  }
  if (role === "parent" && PARENT_OUTCOMES.includes(raw as ParentOutcome)) {
    return { ok: true, outcome: raw as ParentOutcome };
  }
  const allowed = role === "nanny" ? NANNY_OUTCOMES : PARENT_OUTCOMES;
  return {
    ok: false,
    error: `Invalid outcome for ${role} — expected one of ${allowed.join(", ")}.`,
  };
}

function outcomeDescription(
  outcome: NannyOutcome | ParentOutcome,
  role: ConnectionRole,
  counterparty: string,
): string {
  switch (outcome) {
    case "hired":
      return role === "nanny"
        ? `You're telling us ${counterparty} selected you. They'll be notified and asked to confirm, which locks in the placement.`
        : `You're telling us you've chosen ${counterparty}. They'll be notified and asked to confirm — that locks in the placement and releases your other candidates.`;
    case "not_hired":
      return role === "nanny"
        ? `You're logging that ${counterparty} went a different direction. No email — just keeps your pipeline tidy.`
        : `You're logging that ${counterparty} isn't the one. No email sent — just keeps your pipeline tidy.`;
    case "awaiting":
      return `You're marking this as "still deciding". No notification; take your time.`;
    case "trial":
      return role === "nanny"
        ? `You're telling us you've arranged a trial shift. The family will be notified in their inbox to confirm the date.`
        : `You're telling us you've arranged a trial shift. ${counterparty} will be notified in their inbox to confirm.`;
    case "incomplete":
      return `You're logging that the meet and greet didn't happen. This is terminal — the connection closes.`;
    default:
      return "";
  }
}

async function proposeReportOutcome(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  const outcomeResult = validateOutcome(role, args.outcome);
  if (!outcomeResult.ok) return { success: false, error: outcomeResult.error };
  const outcome = outcomeResult.outcome;

  const stages = outcomeStagesFor(role);
  if (!stages.includes(connection.connection_stage ?? -1)) {
    return {
      success: false,
      error:
        "This connection isn't at a stage where an outcome can be reported. Check what stage it's in first.",
    };
  }

  const extraDate =
    typeof args.date === "string" && args.date.trim().length > 0
      ? args.date.trim()
      : null;
  if ((outcome === "trial" || outcome === "hired") && !extraDate) {
    // trial needs trialDate; hired (nanny) benefits from startDate, (parent) benefits from startWeek.
    // Server side treats it as optional though, so don't block — just flag.
  }
  if (extraDate && !/^\d{4}-\d{2}-\d{2}$/.test(extraDate)) {
    return {
      success: false,
      error:
        "If you pass a date for the outcome (trial date, start week), it must be in YYYY-MM-DD format.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  const description = outcomeDescription(outcome, role, displayName);
  const emailSideEffect =
    outcome === "hired" || (role === "parent" && outcome === "trial");

  return {
    success: true,
    data: {
      action: "report_outcome",
      connection_id: connection.id,
      role,
      outcome,
      date: extraDate,
      counterparty_name: displayName,
      email_side_effect: emailSideEffect,
      preview: `${description}${extraDate ? ` Date: ${extraDate}.` : ""}`,
      next_call:
        "Read the preview back verbatim, then wait for explicit yes/cancel. On yes, call apply_report_outcome with the same connection_id, outcome, and date (if any).",
    },
  };
}

async function applyReportOutcome(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  const outcomeResult = validateOutcome(role, args.outcome);
  if (!outcomeResult.ok) return { success: false, error: outcomeResult.error };
  const outcome = outcomeResult.outcome;

  const extraDate =
    typeof args.date === "string" && args.date.trim().length > 0
      ? args.date.trim()
      : undefined;

  const result =
    role === "nanny"
      ? await reportIntroOutcome(
          connection.id,
          outcome as NannyOutcome,
          extraDate,
        )
      : await reportParentOutcome(
          connection.id,
          outcome as ParentOutcome,
          extraDate,
        );

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to report outcome.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "report_outcome",
      connection_id: connection.id,
      role,
      outcome,
      counterparty_name: displayName,
      message: `Logged. ${displayName}'s status has been updated.`,
    },
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
    },
  };
}

// ── Placement confirmation (Path A parent / Path B nanny) ────────────────

async function proposeConfirmPlacement(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  if (connection.connection_stage !== CONNECTION_STAGE.OFFERED) {
    return {
      success: false,
      error:
        "This connection isn't at the 'offered' stage — confirmation isn't available.",
    };
  }

  const initiatedBy = connection.fill_initiated_by;
  if (role === "parent" && initiatedBy !== "nanny") {
    return {
      success: false,
      error:
        "The family only confirms when the nanny has signalled they've been selected (Path A). This one is waiting on the nanny to confirm.",
    };
  }
  if (role === "nanny" && initiatedBy !== "parent") {
    return {
      success: false,
      error:
        "The nanny only confirms when the family has selected them (Path B). This one is waiting on the family to confirm.",
    };
  }

  const startDate =
    typeof args.start_week === "string" && args.start_week.trim().length > 0
      ? args.start_week.trim()
      : null;
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return {
      success: false,
      error: "If you pass `start_week`, it must be in YYYY-MM-DD format.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);

  const preview =
    role === "parent"
      ? `You're about to confirm ${displayName} as your nanny. This is significant:\n- It creates an active placement starting${startDate ? ` the week of ${startDate}` : " soon (you can update the start week later)"}.\n- Your other candidates will be automatically released with a "position filled" notification.\n- You'll both receive a hire-confirmation PDF by email.\nThis can't be undone from here.`
      : `You're about to confirm the position with the ${displayName} family. This is significant:\n- It creates an active placement starting${startDate ? ` the week of ${startDate}` : " soon"}.\n- Any other connections you have at an active stage will be closed.\n- You'll both receive a hire-confirmation PDF by email.\nThis can't be undone from here.`;

  return {
    success: true,
    data: {
      action: "confirm_placement",
      connection_id: connection.id,
      role,
      counterparty_name: displayName,
      start_week: startDate,
      email_side_effect: true,
      preview,
      next_call:
        "Read the preview back VERBATIM. This is a mandatory two-turn confirm — only proceed on an unambiguous affirmative. Call apply_confirm_placement with the same connection_id (and start_week if provided).",
    },
  };
}

async function applyConfirmPlacement(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const resolved = await resolveConnectionForWrite(args.connection_id, ctx);
  if (!resolved.ok) return { success: false, error: resolved.error };
  const { role, connection } = resolved;

  const startWeek =
    typeof args.start_week === "string" && args.start_week.trim().length > 0
      ? args.start_week.trim()
      : undefined;

  const result =
    role === "parent"
      ? await confirmPlacement(connection.id, startWeek)
      : await nannyConfirmPosition(connection.id);

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to confirm placement.",
    };
  }

  const { firstName, lastName } = counterpartyFromRequest(connection, role);
  const displayName = counterpartyDisplayName(firstName, lastName);
  return {
    success: true,
    data: {
      action: "confirm_placement",
      connection_id: connection.id,
      role,
      counterparty_name: displayName,
      message:
        role === "parent"
          ? `Confirmed! ${displayName} is your nanny. Hire PDFs are on the way to both of you, and your other candidates have been released.`
          : `Confirmed! You're starting with the ${displayName} family. Hire PDFs are on the way.`,
    },
    tile: {
      kind: "connection_request",
      data: { id: connection.id },
    },
  };
}

// ── Send new connection request (parent-initiated) ───────────────────────

async function proposeSendConnectionRequest(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") {
    return {
      success: false,
      error: "Only parents send connection requests to nannies.",
    };
  }

  const nannyId = typeof args.nanny_id === "string" ? args.nanny_id.trim() : "";
  if (nannyId.length === 0) {
    return {
      success: false,
      error:
        "Pass `nanny_id` — the id of the nanny to connect with. Users can grab it from a nanny profile page.",
    };
  }

  const message =
    typeof args.message === "string" && args.message.trim().length > 0
      ? args.message.trim()
      : null;
  if (message && message.length > 1000) {
    return {
      success: false,
      error: "Keep your message under 1000 characters.",
    };
  }

  // Pre-check: are they already at the 5-pending cap?
  const { list } = await loadConnections(role);
  const pending = list.filter(
    (r) => r.status === "pending" && !isTerminal(r.connection_stage),
  );
  if (pending.length >= 5) {
    return {
      success: false,
      error:
        "You already have 5 open connection requests waiting for a response. Wait for one to resolve or cancel one before sending a new one.",
    };
  }

  const duplicate = list.find(
    (r) =>
      r.nanny_id === nannyId &&
      ["pending", "accepted", "confirmed"].includes(r.status),
  );
  if (duplicate) {
    return {
      success: false,
      error:
        "You already have an active connection with this nanny — you can't send a second request until that one closes.",
    };
  }

  return {
    success: true,
    data: {
      action: "send_connection_request",
      nanny_id: nannyId,
      has_message: message !== null,
      message_preview: message ? message.slice(0, 200) : null,
      email_side_effect: true,
      preview: message
        ? `You're about to send a connection request to this nanny with this message:\n"${message}"\nThey'll get an email and inbox notification and have 3 days to respond.`
        : `You're about to send a connection request to this nanny (no personal message attached). They'll get an email and inbox notification and have 3 days to respond.`,
      next_call:
        "Read the preview back. On a clear yes, call apply_send_connection_request with the same nanny_id and message.",
    },
  };
}

async function applySendConnectionRequest(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") {
    return {
      success: false,
      error: "Only parents send connection requests to nannies.",
    };
  }

  const nannyId = typeof args.nanny_id === "string" ? args.nanny_id.trim() : "";
  if (!nannyId) {
    return {
      success: false,
      error: "Missing nanny_id — call propose_send_connection_request first.",
    };
  }
  const message =
    typeof args.message === "string" && args.message.trim().length > 0
      ? args.message.trim()
      : undefined;

  const result = await createConnectionRequest(nannyId, message);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to send connection request.",
    };
  }

  return {
    success: true,
    data: {
      action: "send_connection_request",
      nanny_id: nannyId,
      request_id: result.requestId ?? null,
      message:
        "Request sent. They've got 3 days to respond — I'll let you know when they do.",
    },
    tile: result.requestId
      ? {
          kind: "connection_request",
          data: { id: result.requestId },
        }
      : undefined,
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
    {
      name: "propose_accept_connection",
      description:
        "Preview accepting a connection request with an availability slot list (nanny only; request must be pending). Slots are strings of the form 'YYYY-MM-DD_bracket' where bracket = morning|midday|afternoon|evening. Requires ≥5 slots, ≥3 distinct days, and at least one slot in every one of the four brackets. Returns a per-day summary. Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string", description: "The connection id." },
          slots: {
            type: "array",
            description:
              "Availability slots in 'YYYY-MM-DD_bracket' form. Bracket must be one of: morning, midday, afternoon, evening.",
            items: { type: "string" },
            minItems: 5,
          },
        },
        required: ["connection_id", "slots"],
      },
    },
    {
      name: "apply_accept_connection",
      description:
        "Actually accept the connection request with the given slots. Only call after propose_accept_connection and explicit user confirmation. Sends an email (INT-002) to the family and advances the connection to the ACCEPTED stage.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          slots: { type: "array", items: { type: "string" }, minItems: 5 },
        },
        required: ["connection_id", "slots"],
      },
    },
    {
      name: "propose_schedule_meet",
      description:
        "Preview scheduling a meet-and-greet time for a connection (parent only; connection must be in ACCEPTED stage). Date is Sydney-local ISO (YYYY-MM-DD), hour is 24h (0-23), minute is 0-59. Must fall inside one of the nanny's proposed brackets (morning 8-11, midday 11-14, afternoon 14-17, evening 17-20). Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          date: {
            type: "string",
            description: "Sydney-local date in YYYY-MM-DD format.",
          },
          hour: {
            type: "number",
            description: "Hour in 24-hour format, 0-23.",
          },
          minute: { type: "number", description: "Minute, 0-59." },
        },
        required: ["connection_id", "date", "hour", "minute"],
      },
    },
    {
      name: "apply_schedule_meet",
      description:
        "Actually schedule the meet-and-greet. Only after propose_schedule_meet + explicit confirmation. Sends INT-002 to parent (with nanny's phone) and INT-003 to nanny.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          date: { type: "string" },
          hour: { type: "number" },
          minute: { type: "number" },
        },
        required: ["connection_id", "date", "hour", "minute"],
      },
    },
    {
      name: "propose_report_outcome",
      description:
        "Preview reporting a meet-and-greet / trial outcome on a connection. Nanny outcomes: hired, not_hired, awaiting, trial, incomplete. Parent outcomes: hired, not_hired, awaiting, trial. Optional `date` (YYYY-MM-DD) for trial date or hire start week. Does NOT hit the server. Valid only when the connection is in a post-meet stage.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          outcome: {
            type: "string",
            description:
              "Nanny: hired|not_hired|awaiting|trial|incomplete. Parent: hired|not_hired|awaiting|trial.",
          },
          date: {
            type: "string",
            description:
              "Optional YYYY-MM-DD. For outcome='trial' this is the trial date; for outcome='hired' this is the start week.",
          },
        },
        required: ["connection_id", "outcome"],
      },
    },
    {
      name: "apply_report_outcome",
      description:
        "Actually log the outcome. Routes to reportIntroOutcome (nanny) or reportParentOutcome (parent) based on role. For outcome='hired' this sends the hire-offer email and advances the connection toward placement. Only call after propose_report_outcome + explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          outcome: { type: "string" },
          date: { type: "string" },
        },
        required: ["connection_id", "outcome"],
      },
    },
    {
      name: "propose_confirm_placement",
      description:
        "Preview confirming a placement. Path A: parent confirms when nanny signalled 'hired' — creates placement, releases other candidates, emails hire PDFs. Path B: nanny confirms when parent signalled 'hired' — same outcome, initiated from the other side. Connection must be in OFFERED stage; Path is validated against fill_initiated_by. Does NOT hit the server. MANDATORY two-turn confirm — preview must be read back verbatim.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          start_week: {
            type: "string",
            description:
              "Optional YYYY-MM-DD for the start-of-placement week. If omitted, the placement starts according to the server's default.",
          },
        },
        required: ["connection_id"],
      },
    },
    {
      name: "apply_confirm_placement",
      description:
        "Actually confirm the placement. Parent path → confirmPlacement(requestId, startWeek?); nanny path → nannyConfirmPosition(requestId). Sends hire-confirmation PDFs to both parties. Only after propose_confirm_placement + unambiguous explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          connection_id: { type: "string" },
          start_week: { type: "string" },
        },
        required: ["connection_id"],
      },
    },
    {
      name: "propose_send_connection_request",
      description:
        "Preview sending a new connection request to a nanny (parent only). Validates: ≤5 open requests already pending, no existing active connection with this nanny, message ≤ 1000 chars. Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          nanny_id: {
            type: "string",
            description:
              "The nanny's id (from a nanny profile page, not the auth user id).",
          },
          message: {
            type: "string",
            description:
              "Optional personal message from the parent, ≤ 1000 characters.",
          },
        },
        required: ["nanny_id"],
      },
    },
    {
      name: "apply_send_connection_request",
      description:
        "Actually send the request. Sends INT-001 to the nanny, creates the inbox message, and moves the parent's position Open→Connecting if it's the first request. Only after propose_send_connection_request + explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          nanny_id: { type: "string" },
          message: { type: "string" },
        },
        required: ["nanny_id"],
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
    if (toolName === "propose_accept_connection")
      return proposeAcceptConnection(args, ctx);
    if (toolName === "apply_accept_connection")
      return applyAcceptConnection(args, ctx);
    if (toolName === "propose_schedule_meet")
      return proposeScheduleMeet(args, ctx);
    if (toolName === "apply_schedule_meet") return applyScheduleMeet(args, ctx);
    if (toolName === "propose_report_outcome")
      return proposeReportOutcome(args, ctx);
    if (toolName === "apply_report_outcome")
      return applyReportOutcome(args, ctx);
    if (toolName === "propose_confirm_placement")
      return proposeConfirmPlacement(args, ctx);
    if (toolName === "apply_confirm_placement")
      return applyConfirmPlacement(args, ctx);
    if (toolName === "propose_send_connection_request")
      return proposeSendConnectionRequest(args, ctx);
    if (toolName === "apply_send_connection_request")
      return applySendConnectionRequest(args, ctx);
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
    "Writes — every write is TWO TURNS:\n" +
    "  Turn 1: call `propose_<action>`, read the returned `preview` back to the user VERBATIM (especially the preview line — it's the contract), ask for explicit yes/cancel.\n" +
    "  Turn 2: only if the user says yes, call `apply_<action>` with the SAME args. NEVER call apply_ directly without a matching propose_ in the same conversation.\n" +
    "  If the user says anything other than a clear affirmative (yes, confirm, go ahead, do it, proceed), DO NOT call apply_ — ask once more for a clear yes/cancel.\n" +
    "  If a write returns an error, surface the error text verbatim (server messages are already user-safe) and do not silently retry.\n\n" +
    "Available writes:\n" +
    "• `propose_decline_connection` / `apply_decline_connection` — nanny-only; only while pending. Sends INT-004 (neutral, no reason shared).\n" +
    "• `propose_cancel_connection` / `apply_cancel_connection` — either side; any active connection. Inbox notification only.\n" +
    "• `propose_accept_connection` / `apply_accept_connection` — nanny-only; only while pending. Needs ≥5 slots in `YYYY-MM-DD_bracket` form spanning ≥3 days and all 4 brackets (morning/midday/afternoon/evening). The preview groups slots by day — read that back so the user can double-check. Sends the INT-002 acceptance email.\n" +
    "• `propose_schedule_meet` / `apply_schedule_meet` — parent-only; connection must be at ACCEPTED. date is Sydney-local YYYY-MM-DD; hour 0-23, minute 0-59. The chosen date+bracket must match one of the nanny's proposed brackets. Scheduling SHARES the nanny's phone with the parent — always say that in the preview. Sends INT-002/INT-003.\n" +
    "• `propose_report_outcome` / `apply_report_outcome` — either side; post-meet stages. Nanny outcomes: hired|not_hired|awaiting|trial|incomplete. Parent outcomes: hired|not_hired|awaiting|trial. For `hired` and `trial`, pass an optional `date` (YYYY-MM-DD). `hired` triggers the hire flow; read back the consequence ('family will be asked to confirm, your other candidates will be released') in the preview.\n" +
    "• `propose_confirm_placement` / `apply_confirm_placement` — connection must be OFFERED. If the nanny initiated (Path A), only parent can confirm. If the parent initiated (Path B), only nanny can confirm. MANDATORY explicit restate of consequences (placement created, PDFs sent, other candidates released) — never skip.\n" +
    "• `propose_send_connection_request` / `apply_send_connection_request` — parent-only. Needs the nanny_id (the nanny's nannies.id, not their user id — users pick this up from a profile page). Pre-checks the 5-pending cap + duplicate. Message is optional, ≤ 1000 chars. Sends INT-001.\n\n" +
    "If a user asks for any write not listed here (end a position, update placement rate/hours, reject hired claim, schedule a trial from the parent side, confirm a trial, dismiss a stale tile, etc.), tell them that flow still lives on the main inbox / My Positions surface and offer to open the tile.\n" +
    "All propose_ steps enforce role + stage gates with user-safe errors. If the user asks for something the stage doesn't allow, surface the error and explain what they can do instead — don't retry or silently switch to a different action.",
};
