/**
 * Connections translator — maps internal stage / field values to the
 * plain English Katie is allowed to say.
 *
 * HARD RULES (see system/APP/BLOOMBOT/modules/connections/katie-scope.md):
 *   1. Never surface stage numbers ("stage 10", "stage 30") to the user.
 *   2. Never use the words "intro" or "interview" — say "meet and greet".
 *   3. Never use the phrase "connection_request" — say "connection" or
 *      "request".
 *   4. Never expose `fill_initiated_by`, `connection_stage`,
 *      `proposed_times`, `confirmed_time`, `nanny_phone_shared`, or any
 *      other DB field name.
 *   5. Wording varies by role — parent and nanny see different English
 *      for the same underlying stage.
 *
 * This file is the single place that translation happens. Adding a new
 * stage = add a branch here + a test, not scatter copy through modules.
 */

import { CONNECTION_STAGE } from "@/lib/position/constants";

export type ConnectionRole = "nanny" | "parent";

/** Plain English headline for what stage the connection is in. */
export function stageHeadline(
  stage: number | null,
  role: ConnectionRole,
  opts: { counterpartyName: string; fillInitiatedBy?: string | null } = {
    counterpartyName: "them",
  },
): string {
  const { counterpartyName, fillInitiatedBy } = opts;
  const name = counterpartyName || "them";

  switch (stage) {
    case CONNECTION_STAGE.REQUEST_SENT:
      return role === "parent"
        ? `Your request to ${name} is waiting for a response.`
        : `A new request from ${name}.`;
    case CONNECTION_STAGE.REQUEST_EXPIRED:
      return `The request expired — we didn't hear back in time.`;
    case CONNECTION_STAGE.DECLINED:
      return role === "parent"
        ? `${name} couldn't take it on — sometimes scheduling just doesn't line up.`
        : `You declined this request.`;
    case CONNECTION_STAGE.REQUEST_CANCELLED:
    case CONNECTION_STAGE.CANCELLED_BY_PARENT:
      return role === "parent"
        ? `You cancelled this.`
        : `The family cancelled this request.`;
    case CONNECTION_STAGE.CANCELLED_BY_NANNY:
      return role === "parent"
        ? `${name} has stepped back from this one.`
        : `You stepped back from this one.`;
    case CONNECTION_STAGE.NANNY_APPLIED_PENDING:
    case CONNECTION_STAGE.NANNY_APPLIED:
      return role === "parent"
        ? `${name} has applied to your position.`
        : `You've applied to this position.`;
    case CONNECTION_STAGE.ACCEPTED_PENDING:
    case CONNECTION_STAGE.ACCEPTED:
      return role === "parent"
        ? `${name} accepted — pick a time for your meet and greet.`
        : `You accepted — waiting for ${name} to schedule a time.`;
    case CONNECTION_STAGE.SCHEDULE_EXPIRED:
      return `Time ran out before a meet and greet could be scheduled.`;
    case CONNECTION_STAGE.INTRO_SCHEDULED:
      return `Meet and greet scheduled with ${name}.`;
    case CONNECTION_STAGE.INTRO_COMPLETE:
      return `Your meet and greet with ${name} is done — how did it go?`;
    case CONNECTION_STAGE.INTRO_INCOMPLETE:
      return `The meet and greet with ${name} didn't take place.`;
    case CONNECTION_STAGE.AWAITING_RESPONSE:
      return `Waiting to hear back from ${name}.`;
    case CONNECTION_STAGE.TRIAL_ARRANGED:
      // Who initiated the trial matters — the OTHER party needs to confirm.
      if (fillInitiatedBy === "nanny") {
        return role === "parent"
          ? `${name} says a trial shift is arranged — please confirm.`
          : `Waiting for ${name} to confirm the trial.`;
      }
      if (fillInitiatedBy === "parent") {
        return role === "nanny"
          ? `${name} says a trial shift is arranged — please confirm.`
          : `Waiting for ${name} to confirm the trial.`;
      }
      return `Trial shift booked.`;
    case CONNECTION_STAGE.TRIAL_COMPLETE:
      return `Trial with ${name} is done — how did it go?`;
    case CONNECTION_STAGE.OFFERED:
      if (fillInitiatedBy === "nanny") {
        return role === "parent"
          ? `${name} says they've been selected — confirm to make it official.`
          : `Waiting for ${name} to confirm.`;
      }
      if (fillInitiatedBy === "parent") {
        return role === "nanny"
          ? `${name} has selected you — confirm to get started.`
          : `Waiting for ${name} to confirm.`;
      }
      return `Offer stage.`;
    case CONNECTION_STAGE.CONFIRMED:
      return `Placement being set up.`;
    case CONNECTION_STAGE.NOT_HIRED:
      return `This one didn't work out.`;
    case CONNECTION_STAGE.NOT_SELECTED:
      return role === "nanny"
        ? `The family went with another nanny.`
        : `This one didn't work out.`;
    case CONNECTION_STAGE.ACTIVE:
      return role === "parent"
        ? `Your nanny ${name} is an active placement.`
        : `Active placement with ${name}.`;
    case CONNECTION_STAGE.FINISHED:
      return `Placement ended.`;
    default:
      return `Connection with ${name}.`;
  }
}

/**
 * What does this user need to do next, if anything? Returns null when
 * the next move is on the OTHER party (or when there's nothing to do).
 */
export function nextStepForUser(
  stage: number | null,
  role: ConnectionRole,
  opts: { fillInitiatedBy?: string | null } = {},
): string | null {
  const { fillInitiatedBy } = opts;

  switch (stage) {
    case CONNECTION_STAGE.REQUEST_SENT:
      return role === "nanny" ? "Accept or decline the request." : null;
    case CONNECTION_STAGE.ACCEPTED:
    case CONNECTION_STAGE.ACCEPTED_PENDING:
      return role === "parent" ? "Pick a time for your meet and greet." : null;
    case CONNECTION_STAGE.INTRO_COMPLETE:
      return "Report how the meet and greet went.";
    case CONNECTION_STAGE.TRIAL_ARRANGED:
      if (fillInitiatedBy === "nanny") {
        return role === "parent"
          ? "Confirm or decline the proposed trial shift."
          : null;
      }
      if (fillInitiatedBy === "parent") {
        return role === "nanny"
          ? "Confirm or decline the proposed trial shift."
          : null;
      }
      return null;
    case CONNECTION_STAGE.TRIAL_COMPLETE:
      return "Report how the trial went.";
    case CONNECTION_STAGE.OFFERED:
      if (fillInitiatedBy === "nanny") {
        return role === "parent"
          ? "Confirm the placement to make it official."
          : null;
      }
      if (fillInitiatedBy === "parent") {
        return role === "nanny" ? "Confirm to accept the position." : null;
      }
      return null;
    case CONNECTION_STAGE.AWAITING_RESPONSE:
      return null; // Waiting on the other side, no user action.
    default:
      return null;
  }
}

/**
 * Stage buckets for filtering. ACTIVE stages = everything pre-terminal
 * that Katie should consider "still in play". TERMINAL = closed-out.
 */
const TERMINAL_STAGES: ReadonlySet<number> = new Set([
  CONNECTION_STAGE.REQUEST_EXPIRED,
  CONNECTION_STAGE.DECLINED,
  CONNECTION_STAGE.REQUEST_CANCELLED,
  CONNECTION_STAGE.SCHEDULE_EXPIRED,
  CONNECTION_STAGE.INTRO_INCOMPLETE,
  CONNECTION_STAGE.NOT_HIRED,
  CONNECTION_STAGE.NOT_SELECTED,
  CONNECTION_STAGE.FINISHED,
  CONNECTION_STAGE.CANCELLED_BY_PARENT,
  CONNECTION_STAGE.CANCELLED_BY_NANNY,
]);

export function isTerminal(stage: number | null): boolean {
  if (stage == null) return false;
  return TERMINAL_STAGES.has(stage);
}

/**
 * Stages that require the user to do something. Used to power
 * `read_action_required`.
 */
export function isActionRequired(
  stage: number | null,
  role: ConnectionRole,
  fillInitiatedBy: string | null | undefined,
): boolean {
  return nextStepForUser(stage, role, { fillInitiatedBy }) !== null;
}

/**
 * Time-left summary (e.g. "2 days 6 hours left", "expires soon",
 * "expired"). Returns null when expires_at is null / unset.
 */
export function timeLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return null;

  const diffMs = expiry - now;
  if (diffMs <= 0) return "expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const hoursAfterDays = hours - days * 24;

  if (days > 0) {
    return hoursAfterDays > 0
      ? `${days}d ${hoursAfterDays}h left`
      : `${days}d left`;
  }
  if (hours > 0) {
    return `${hours}h left`;
  }
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  return `${minutes}m left`;
}

/** Short display form for a counterparty name — "Jessica M." */
export function counterpartyDisplayName(
  firstName: string,
  lastName: string | null | undefined,
): string {
  const initial =
    typeof lastName === "string" && lastName.trim().length > 0
      ? lastName.trim().charAt(0).toUpperCase()
      : "";
  return initial ? `${firstName} ${initial}.` : firstName;
}
