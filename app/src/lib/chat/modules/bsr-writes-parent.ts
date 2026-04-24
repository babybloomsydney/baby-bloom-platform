/**
 * Parent-side BSR writes:
 *
 *   - propose_/apply_accept_nanny   — MANDATORY two-turn confirm +
 *                                     phone reveal from server
 *   - decline_nanny                 — single-turn; silent notification
 *                                     (nanny gets inbox-only)
 *   - propose_/apply_cancel_request — two-turn; terminal
 *
 * `accept_nanny` is the high-stakes one — it books the nanny, reveals
 * their phone to the parent, and releases other requesters. The
 * server returns `{ nannyFirstName, nannyPhone }` which the apply
 * step surfaces back through `data` so Katie can narrate contact info.
 */

import type { ToolDefinition, ToolResult } from "./types";
import {
  getParentBabysittingRequests,
  parentAcceptNanny,
  parentDeclineNanny,
  cancelBabysittingRequest,
} from "@/lib/actions/babysitting";
import { asUserFacingRole } from "./utils";
import {
  summariseParentRequest,
  roleOnlyError,
  parentOnlyError,
  type BsrModuleContext,
  type ParentBsrRow,
} from "./bsr-shared";

// ── Helpers ──────────────────────────────────────────────────────────────

async function resolveParentRequest(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<
  | {
      ok: true;
      jobId: string;
      summary: ReturnType<typeof summariseParentRequest>;
    }
  | { ok: false; error: ToolResult }
> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return { ok: false, error: roleOnlyError() };
  if (role !== "parent") return { ok: false, error: parentOnlyError() };

  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (!jobId) {
    return {
      ok: false,
      error: {
        success: false,
        error: "Pass `job_id` — the babysitting request id.",
      },
    };
  }

  const result = await getParentBabysittingRequests();
  if (result.error) {
    return { ok: false, error: { success: false, error: result.error } };
  }
  const rows = (result.data as unknown as ParentBsrRow[]) ?? [];
  const row = rows.find((r) => r.id === jobId);
  if (!row) {
    return {
      ok: false,
      error: {
        success: false,
        error: `No babysitting request found with id "${jobId}" on your account.`,
      },
    };
  }
  return { ok: true, jobId, summary: summariseParentRequest(row) };
}

function requireNannyId(
  args: Record<string, unknown>,
): { ok: true; nannyId: string } | { ok: false; error: ToolResult } {
  const nannyId = typeof args.nanny_id === "string" ? args.nanny_id.trim() : "";
  if (!nannyId) {
    return {
      ok: false,
      error: {
        success: false,
        error:
          "Pass `nanny_id` — the requesting nanny's id (from the list of requesting nannies on the request).",
      },
    };
  }
  return { ok: true, nannyId };
}

// ── propose_/apply_accept_nanny (MANDATORY two-turn + phone reveal) ────

async function proposeAcceptNanny(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveParentRequest(args, ctx);
  if (!r.ok) return r.error;
  const n = requireNannyId(args);
  if (!n.ok) return n.error;

  if (r.summary.bucket !== "awaiting_requesters") {
    return {
      success: false,
      error:
        "This request isn't accepting new nannies right now — it's either still pending payment, already booked, or past.",
    };
  }

  return {
    success: true,
    data: {
      action: "accept_nanny",
      job_id: r.jobId,
      nanny_id: n.nannyId,
      email_side_effect: true,
      preview:
        "You're about to BOOK this nanny. This is significant:\n" +
        "- The booking is confirmed immediately and their phone number will be shared with you.\n" +
        "- Any other nannies who've requested this job will be released with a neutral notification.\n" +
        "- You can still cancel the booking later, but cancellation forfeits your spot and may affect both sides.\n" +
        "Proceed?",
      next_call:
        "MANDATORY: read the preview back VERBATIM (including the phone-share and auto-release consequences). Only proceed on an unambiguous 'yes'. Call apply_accept_nanny with the same job_id + nanny_id on confirmation.",
    },
  };
}

async function applyAcceptNanny(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveParentRequest(args, ctx);
  if (!r.ok) return r.error;
  const n = requireNannyId(args);
  if (!n.ok) return n.error;

  if (r.summary.bucket !== "awaiting_requesters") {
    return {
      success: false,
      error:
        "This request has moved past the accepting-nannies stage — may have been booked or cancelled since propose.",
    };
  }

  const result = await parentAcceptNanny(r.jobId, n.nannyId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to accept the nanny.",
    };
  }

  const firstName = result.nannyFirstName ?? "Your nanny";
  const phone = result.nannyPhone ?? null;

  return {
    success: true,
    data: {
      action: "accept_nanny",
      job_id: r.jobId,
      nanny_id: n.nannyId,
      nanny_first_name: firstName,
      nanny_phone: phone,
      message: phone
        ? `Booked ${firstName}. Their phone is ${phone} — they'll reach out shortly, or you can message first.`
        : `Booked ${firstName}. Contact details will appear on your babysitting page.`,
    },
  };
}

// ── decline_nanny (single-turn) ──────────────────────────────────────────

async function declineNanny(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveParentRequest(args, ctx);
  if (!r.ok) return r.error;
  const n = requireNannyId(args);
  if (!n.ok) return n.error;

  if (r.summary.bucket !== "awaiting_requesters") {
    return {
      success: false,
      error:
        "This request isn't in the requester-review stage — you can only pass on nannies while the request is still awaiting requesters.",
    };
  }

  const result = await parentDeclineNanny(r.jobId, n.nannyId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to decline the nanny.",
    };
  }

  return {
    success: true,
    data: {
      action: "decline_nanny",
      job_id: r.jobId,
      nanny_id: n.nannyId,
      message:
        "Passed on that nanny. They won't receive a notification about it — the move is silent.",
    },
  };
}

// ── propose_/apply_cancel_request (two-turn terminal) ──────────────────

async function proposeCancelRequest(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveParentRequest(args, ctx);
  if (!r.ok) return r.error;

  if (r.summary.bucket === "past") {
    return {
      success: false,
      error: "This request is already closed — cancel isn't available.",
    };
  }

  return {
    success: true,
    data: {
      action: "cancel_request",
      job_id: r.jobId,
      email_side_effect: false,
      preview: `You're about to CANCEL this babysitting request (${r.summary.title ?? r.summary.suburb}). Any nannies who've requested it will be released. This is terminal — you'd need to post a fresh request to re-open it. Payment refund rules apply per your terms.`,
      next_call:
        "Read the preview back and wait for explicit yes/cancel. On yes, call apply_cancel_request with the same job_id.",
    },
  };
}

async function applyCancelRequest(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const r = await resolveParentRequest(args, ctx);
  if (!r.ok) return r.error;

  if (r.summary.bucket === "past") {
    return {
      success: false,
      error: "This request is already closed.",
    };
  }

  const result = await cancelBabysittingRequest(r.jobId);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to cancel the request.",
    };
  }

  return {
    success: true,
    data: {
      action: "cancel_request",
      job_id: r.jobId,
      message:
        "Cancelled. Any requesting nannies have been notified and the job is closed.",
    },
  };
}

// ── Exports ──────────────────────────────────────────────────────────────

export const parentWriteTools: ToolDefinition[] = [
  {
    name: "propose_accept_nanny",
    description:
      "Parent-only, MANDATORY two-turn confirm. Preview booking a nanny from the request's applicant list. The preview must restate that: the nanny's phone will be revealed, other applicants will be released, and cancellation later forfeits the spot. Does NOT hit the server.",
    parameters: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "Babysitting request id (from read_my_requests).",
        },
        nanny_id: {
          type: "string",
          description:
            "The applying nanny's id (from bsr_get_requesting_nannies — that list isn't yet wired here; for now the parent picks the id from their main /parent/babysitting page).",
        },
      },
      required: ["job_id", "nanny_id"],
    },
  },
  {
    name: "apply_accept_nanny",
    description:
      "Parent-only. Actually book the nanny. Only after propose_accept_nanny + unambiguous confirmation. Server returns `nanny_first_name` + `nanny_phone` which Katie should surface so the parent can make contact.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        nanny_id: { type: "string" },
      },
      required: ["job_id", "nanny_id"],
    },
  },
  {
    name: "decline_nanny",
    description:
      "Parent-only, SINGLE-TURN confirm. Pass on a nanny who's requested the job. The nanny receives NO notification of the decline (the move is silent). Still prompt with a single-turn 'Pass on [FirstName]?' before calling.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        nanny_id: { type: "string" },
      },
      required: ["job_id", "nanny_id"],
    },
  },
  {
    name: "propose_cancel_request",
    description:
      "Parent-only. Preview cancelling an active babysitting request. Terminal — re-opening requires posting a fresh request. Does NOT hit the server.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "apply_cancel_request",
    description:
      "Parent-only. Actually cancel the babysitting request. Only after propose_cancel_request + explicit confirmation.",
    parameters: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
];

export async function tryExecuteParentWrite(
  toolName: string,
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult | null> {
  if (toolName === "propose_accept_nanny") return proposeAcceptNanny(args, ctx);
  if (toolName === "apply_accept_nanny") return applyAcceptNanny(args, ctx);
  if (toolName === "decline_nanny") return declineNanny(args, ctx);
  if (toolName === "propose_cancel_request")
    return proposeCancelRequest(args, ctx);
  if (toolName === "apply_cancel_request") return applyCancelRequest(args, ctx);
  return null;
}
