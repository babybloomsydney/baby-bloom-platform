/**
 * Nanny-side BSR writes:
 *
 *   - request_job                 — single-turn with inline legal
 *                                   disclosure (phone shared on accept)
 *   - propose_/apply_decline_job  — two-turn, terminal. Same server
 *                                   action as withdraw; state-aware.
 *   - propose_/apply_withdraw_request — two-turn, terminal.
 *   - propose_/apply_nanny_cancel_accepted — MANDATORY two-turn with
 *                                   the 3-strike-ban disclosure.
 *
 * Per the audit (system/APP/BLOOMBOT/modules/bsr/katie-scope.md),
 * `request_job` is deliberately single-turn — speed matters for the
 * nanny since the parent picks from early requesters. The disclosure
 * is carried in the tool description + the Katie system prompt so
 * Gemini always surfaces it inline.
 */

import type { ToolDefinition, ToolResult } from "./types";
import {
  getNannyBabysittingJobs,
  requestBabysittingJob,
  declineBabysittingRequest,
  nannyCancelBabysittingRequest,
} from "@/lib/actions/babysitting";
import { asUserFacingRole } from "./utils";
import { banText } from "./bsr-translator";
import {
  summariseNannyJob,
  roleOnlyError,
  nannyOnlyError,
  type BsrModuleContext,
} from "./bsr-shared";

// ── request_job (single-turn) ────────────────────────────────────────────

async function requestJob(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError();

  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) {
    return {
      success: false,
      error:
        "Pass `job_id` — the babysitting request id the nanny wants to request.",
    };
  }

  // Verify the nanny actually has this job in their available bucket
  // before firing. The server enforces this too, but failing early
  // gives a clearer error than the server's generic "not eligible".
  const listed = await getNannyBabysittingJobs();
  if (listed.error) return { success: false, error: listed.error };
  if (listed.banned) {
    return {
      success: false,
      error:
        banText(listed.banUntil) ??
        "You're currently suspended from babysitting jobs.",
    };
  }
  const job = listed.data.find((j) => j.id === jobId);
  if (!job) {
    return {
      success: false,
      error: "That babysitting job isn't in your current invitations.",
    };
  }
  const summary = summariseNannyJob(job);
  if (summary.bucket !== "available") {
    return {
      success: false,
      error:
        "This job isn't in your Available bucket — you may have already requested it, declined it, or the family has booked someone else.",
    };
  }
  if (summary.clash_warning) {
    return {
      success: false,
      error:
        "This job clashes with one of your existing bookings. The server requires a 2-hour buffer between jobs — check your schedule.",
    };
  }

  const result = await requestBabysittingJob(jobId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to request the job.",
    };
  }

  return {
    success: true,
    data: {
      action: "request_job",
      job_id: jobId,
      message:
        "Requested. The family will review and let you know if you're the one. Your phone will be shared with them if they accept.",
    },
  };
}

// ── decline_job / withdraw_request (two-turn terminal) ──────────────────

async function resolveNannyJob(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<
  | { ok: true; jobId: string; summary: ReturnType<typeof summariseNannyJob> }
  | { ok: false; error: ToolResult }
> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return { ok: false, error: roleOnlyError() };
  if (role !== "nanny") return { ok: false, error: nannyOnlyError() };

  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) {
    return {
      ok: false,
      error: {
        success: false,
        error: "Pass `job_id` — the babysitting request id to act on.",
      },
    };
  }

  const listed = await getNannyBabysittingJobs();
  if (listed.error) {
    return { ok: false, error: { success: false, error: listed.error } };
  }
  const job = listed.data.find((j) => j.id === jobId);
  if (!job) {
    return {
      ok: false,
      error: {
        success: false,
        error: "That babysitting job isn't in your invitations.",
      },
    };
  }
  return { ok: true, jobId, summary: summariseNannyJob(job) };
}

async function proposeDeclineJob(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveNannyJob(args, ctx);
  if (!r.ok) return r.error;

  if (r.summary.bucket !== "available" && r.summary.bucket !== "requested") {
    return {
      success: false,
      error:
        "This job isn't in a declinable stage — it's already past or has been booked with someone else.",
    };
  }

  const isWithdraw = r.summary.bucket === "requested";
  const preview = isWithdraw
    ? `You're about to WITHDRAW your request for this babysitting job. This is final — you can't re-request the same job later, and you'll lose your place in the family's consideration.`
    : `You're about to DECLINE this babysitting job. This is final — you can't request it later. Slot: ${r.summary.slots.join("; ") || "unknown"}. ${r.summary.suburb}, ~${r.summary.distance}.`;

  return {
    success: true,
    data: {
      action: isWithdraw ? "withdraw_request" : "decline_job",
      job_id: r.jobId,
      email_side_effect: false,
      preview,
      next_call: `Read the preview back verbatim and wait for explicit yes/cancel. On yes, call ${isWithdraw ? "apply_withdraw_request" : "apply_decline_job"} with the same job_id.`,
    },
  };
}

async function applyDeclineJob(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveNannyJob(args, ctx);
  if (!r.ok) return r.error;

  // Re-check bucket at apply time (state can drift between turns).
  if (r.summary.bucket !== "available" && r.summary.bucket !== "requested") {
    return {
      success: false,
      error:
        "This job has moved past the declinable stage — can't decline any more.",
    };
  }

  const result = await declineBabysittingRequest(r.jobId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to decline the job.",
    };
  }

  const isWithdraw = r.summary.bucket === "requested";
  return {
    success: true,
    data: {
      action: isWithdraw ? "withdraw_request" : "decline_job",
      job_id: r.jobId,
      message: isWithdraw
        ? "Withdrawn. You're no longer in the family's consideration for this one."
        : "Declined. You won't be notified about this job again.",
    },
  };
}

// ── nanny_cancel_accepted (MANDATORY two-turn + ban disclosure) ──────────

const BAN_DISCLOSURE =
  "Cancelling accepted babysitting jobs counts against your record. 3 cancellations in a rolling 12-month window will trigger a 3-month suspension from babysitting job invitations.";

async function proposeNannyCancelAccepted(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveNannyJob(args, ctx);
  if (!r.ok) return r.error;

  if (r.summary.bucket !== "accepted") {
    return {
      success: false,
      error:
        "You can only cancel a job you've already been accepted for. This one isn't in your Accepted bucket.",
    };
  }

  return {
    success: true,
    data: {
      action: "nanny_cancel_accepted",
      job_id: r.jobId,
      email_side_effect: false,
      preview: `You're about to CANCEL an accepted babysitting job. ${BAN_DISCLOSURE} The family will be notified and the job will reopen for other nannies.`,
      ban_disclosure: BAN_DISCLOSURE,
      next_call:
        "MANDATORY: read the preview + ban disclosure back VERBATIM. Only proceed on an unambiguous 'yes' — any hesitation means don't apply. Call apply_nanny_cancel_accepted with the same job_id on confirmation.",
    },
  };
}

async function applyNannyCancelAccepted(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveNannyJob(args, ctx);
  if (!r.ok) return r.error;

  if (r.summary.bucket !== "accepted") {
    return {
      success: false,
      error:
        "This job is no longer in your Accepted bucket — state may have changed.",
    };
  }

  const result = await nannyCancelBabysittingRequest(r.jobId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to cancel the accepted job.",
    };
  }

  const nowBanned = result.banned === true;
  const countPart =
    typeof result.cancellationCount === "number"
      ? `This is cancellation #${result.cancellationCount} in your rolling 12 months.`
      : "";

  return {
    success: true,
    data: {
      action: "nanny_cancel_accepted",
      job_id: r.jobId,
      cancellation_count: result.cancellationCount ?? null,
      banned: nowBanned,
      message: nowBanned
        ? `Cancelled. ${countPart} That triggered the 3-month suspension — you won't receive new babysitting job invitations until it ends.`
        : `Cancelled. The family has been notified and the job is reopening. ${countPart}`,
    },
  };
}

// ── Exports ──────────────────────────────────────────────────────────────

export const nannyWriteTools: ToolDefinition[] = [
  {
    name: "request_job",
    description:
      "Nanny-only, SINGLE-TURN (speed matters — parent picks from early requesters). Request a babysitting job the nanny has been invited to. Surface the disclosure in your reply: 'your phone number will be shared with the family if they accept you'. Pre-checks: nanny not banned, job in Available bucket, no schedule clash.",
    parameters: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description:
            "The babysitting request id (from read_my_jobs). Must be in the Available bucket.",
        },
      },
      required: ["job_id"],
    },
  },
  {
    name: "propose_decline_job",
    description:
      "Nanny-only. Preview declining or withdrawing a babysitting job — both go through the same server action, distinguished by current state (Available → decline, Requested → withdraw). TERMINAL — nanny can't re-request after this. Does NOT hit the server.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "apply_decline_job",
    description:
      "Nanny-only. Actually decline the babysitting job. Only call after propose_decline_job + explicit user confirmation.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "propose_withdraw_request",
    description:
      "Alias for propose_decline_job when the job is in the Requested bucket — same underlying tool. Preview withdrawing an in-flight request. Does NOT hit the server.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "apply_withdraw_request",
    description:
      "Alias for apply_decline_job — actually withdraw the request. Only call after propose_withdraw_request + explicit confirmation.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "propose_nanny_cancel_accepted",
    description:
      "Nanny-only, MANDATORY two-turn confirm. Preview cancelling a job the nanny already accepted. The preview includes the 3-cancellation-in-12-months ban disclosure — read it back VERBATIM. Does NOT hit the server.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "apply_nanny_cancel_accepted",
    description:
      "Nanny-only. Actually cancel the accepted job. Only call after propose_nanny_cancel_accepted + unambiguous explicit confirmation. If this trips the 3-strike rule, the response includes `banned: true` with the 3-month suspension — narrate that to the user.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
];

export async function tryExecuteNannyWrite(
  toolName: string,
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult | null> {
  if (toolName === "request_job") return requestJob(args, ctx);
  if (toolName === "propose_decline_job") return proposeDeclineJob(args, ctx);
  if (toolName === "apply_decline_job") return applyDeclineJob(args, ctx);
  if (toolName === "propose_withdraw_request")
    return proposeDeclineJob(args, ctx);
  if (toolName === "apply_withdraw_request") return applyDeclineJob(args, ctx);
  if (toolName === "propose_nanny_cancel_accepted")
    return proposeNannyCancelAccepted(args, ctx);
  if (toolName === "apply_nanny_cancel_accepted")
    return applyNannyCancelAccepted(args, ctx);
  return null;
}
