/**
 * Read tools for the BSR module.
 *
 * Three tools, all role-gated:
 *   - read_my_jobs     — nanny-only; invitations bucketed by state
 *   - read_my_requests — parent-only; own posted requests by state
 *   - read_job_detail  — either side, owner-scoped
 *
 * Writes live in `bsr-writes-nanny.ts` and `bsr-writes-parent.ts`.
 */

import type { ToolDefinition, ToolResult } from "./types";
import {
  getNannyBabysittingJobs,
  getParentBabysittingRequests,
} from "@/lib/actions/babysitting";
import { asUserFacingRole } from "./utils";
import { banText } from "./bsr-translator";
import {
  summariseNannyJob,
  summariseParentRequest,
  roleOnlyError,
  nannyOnlyError,
  parentOnlyError,
  type BsrModuleContext,
  type ParentBsrRow,
} from "./bsr-shared";

async function readMyJobs(
  _args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError();

  const result = await getNannyBabysittingJobs();
  if (result.error) return { success: false, error: result.error };

  const summaries = result.data.map(summariseNannyJob);
  const byBucket = {
    available: summaries.filter((j) => j.bucket === "available"),
    requested: summaries.filter((j) => j.bucket === "requested"),
    accepted: summaries.filter((j) => j.bucket === "accepted"),
    past: summaries.filter((j) => j.bucket === "past"),
  };

  return {
    success: true,
    data: {
      role: "nanny",
      banned: result.banned,
      ban_text: banText(result.banUntil),
      count: summaries.length,
      available_count: byBucket.available.length,
      requested_count: byBucket.requested.length,
      accepted_count: byBucket.accepted.length,
      past_count: byBucket.past.length,
      buckets: (
        [
          { name: "available", items: byBucket.available },
          { name: "requested", items: byBucket.requested },
          { name: "accepted", items: byBucket.accepted },
          { name: "past", items: byBucket.past },
        ] as const
      ).filter((b) => b.items.length > 0),
    },
  };
}

async function readMyRequests(
  _args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") return parentOnlyError();

  const result = await getParentBabysittingRequests();
  if (result.error) return { success: false, error: result.error };

  const rows = (result.data as unknown as ParentBsrRow[]) ?? [];
  const summaries = rows.map(summariseParentRequest);
  const byBucket = {
    pending_payment: summaries.filter((r) => r.bucket === "pending_payment"),
    awaiting_requesters: summaries.filter(
      (r) => r.bucket === "awaiting_requesters",
    ),
    booked: summaries.filter((r) => r.bucket === "booked"),
    past: summaries.filter((r) => r.bucket === "past"),
  };

  return {
    success: true,
    data: {
      role: "parent",
      count: summaries.length,
      pending_payment_count: byBucket.pending_payment.length,
      awaiting_count: byBucket.awaiting_requesters.length,
      booked_count: byBucket.booked.length,
      past_count: byBucket.past.length,
      buckets: (
        [
          { name: "pending_payment", items: byBucket.pending_payment },
          { name: "awaiting_requesters", items: byBucket.awaiting_requesters },
          { name: "booked", items: byBucket.booked },
          { name: "past", items: byBucket.past },
        ] as const
      ).filter((b) => b.items.length > 0),
    },
  };
}

async function readJobDetail(
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  const jobId = typeof args.job_id === "string" ? args.job_id.trim() : "";
  if (jobId.length === 0) {
    return {
      success: false,
      error:
        "Pass `job_id` — the babysitting request id (from read_my_jobs / read_my_requests).",
    };
  }

  if (role === "nanny") {
    const result = await getNannyBabysittingJobs();
    if (result.error) return { success: false, error: result.error };
    const job = result.data.find((j) => j.id === jobId);
    if (!job) {
      return {
        success: false,
        error: `No babysitting job found with id "${jobId}" in your invitations.`,
      };
    }
    return {
      success: true,
      data: summariseNannyJob(job),
      tile: { kind: "bsr_job", data: { id: job.id } },
    };
  }

  // parent
  const result = await getParentBabysittingRequests();
  if (result.error) return { success: false, error: result.error };
  const rows = (result.data as unknown as ParentBsrRow[]) ?? [];
  const row = rows.find((r) => r.id === jobId);
  if (!row) {
    return {
      success: false,
      error: `No babysitting request found with id "${jobId}" on your account.`,
    };
  }
  return {
    success: true,
    data: summariseParentRequest(row),
    tile: { kind: "bsr_job", data: { id: row.id } },
  };
}

// ── Exports ──────────────────────────────────────────────────────────────

export const readTools: ToolDefinition[] = [
  {
    name: "read_my_jobs",
    description:
      "Nanny-only. Return the user's babysitting job invitations bucketed into Available, Requested, Accepted, and Past. Each entry has pre-rendered slots, distance, rate, expiry, and a plain-English headline. Also returns the ban status when the nanny is currently suspended from babysitting jobs. Use for 'any babysitting jobs?', 'who's waiting on me?', 'am I banned?'.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_my_requests",
    description:
      "Parent-only. Return the user's babysitting requests bucketed into Pending Payment, Awaiting Requesters, Booked, and Past. Each entry has pre-rendered slots, rate, and expiry. Use for 'what babysitters have I booked?', 'any open requests?', 'has anyone applied?'.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_job_detail",
    description:
      "Return full detail for a single babysitting request / job by id. Nanny sees their invitation view; parent sees their own request view. Use when the user names a specific request or the chat references a prior job_id.",
    parameters: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description:
            "The babysitting request id (same `id` returned by read_my_jobs / read_my_requests).",
        },
      },
      required: ["job_id"],
    },
  },
];

export async function tryExecuteRead(
  toolName: string,
  args: Record<string, unknown>,
  ctx: BsrModuleContext,
): Promise<ToolResult | null> {
  if (toolName === "read_my_jobs") return readMyJobs(args, ctx);
  if (toolName === "read_my_requests") return readMyRequests(args, ctx);
  if (toolName === "read_job_detail") return readJobDetail(args, ctx);
  return null;
}

export const readSystemPromptFragment =
  "Reads:\n" +
  "• Nanny: 'any babysitting?' / 'who's waiting on me?' → `read_my_jobs`. Narrate the active buckets that have content (skip empty ones). If the user is banned, the tool returns `ban_text` — relay that verbatim.\n" +
  "• Parent: 'what babysitters have I booked?' / 'any open requests?' → `read_my_requests`.\n" +
  "• Either: 'tell me more about the Saturday one' / user references a specific job → `read_job_detail` with the id from the prior read.";
