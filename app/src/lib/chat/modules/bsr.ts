/**
 * `bsr` module — Katie's read view over the Babysitting Requests
 * pipeline. v1 is READ-ONLY.
 *
 * Writes (request_job, decline_job, parent_accept_nanny, etc.) land in
 * a follow-up phase (4D.2) because:
 *   - `request_job` is single-turn but shares the nanny's phone with
 *     the parent on parent-accept — needs careful disclosure copy.
 *   - `parent_accept_nanny` is mandatory two-turn + reveals phone.
 *   - `nanny_cancel_accepted` must include the 3-strike-ban disclosure
 *     verbatim.
 *   - None of these are trivial propose/apply pairs; the established
 *     pattern needs adapting for the single-turn BSR flows.
 *
 * For now Katie points users at the main /nanny/babysitting and
 * /parent/babysitting surfaces when they want to act. All reads
 * translate status / timestamps / distances to plain English up front
 * via `./bsr-translator.ts`.
 */

import type { BloomBotModule, ToolResult } from "./types";
import {
  getNannyBabysittingJobs,
  getParentBabysittingRequests,
  type NannyBabysittingJob,
} from "@/lib/actions/babysitting";
import { asUserFacingRole } from "./utils";
import {
  nannyJobBucket,
  parentRequestBucket,
  bucketHeadline,
  expiryText,
  distanceText,
  formatSlot,
  childrenSummary,
  banText,
} from "./bsr-translator";

// ── Shape helpers ─────────────────────────────────────────────────────────

interface NannyJobSummary {
  id: string;
  bucket: "available" | "requested" | "accepted" | "past";
  headline: string;
  title: string | null;
  suburb: string;
  distance: string;
  hourly_rate: number | null;
  estimated_total: number | null;
  slots: string[];
  children: string;
  special_requirements: string | null;
  expires: string | null;
  expires_urgent: boolean;
  clash_warning: boolean;
}

interface ParentRequestSummary {
  id: string;
  bucket: "pending_payment" | "awaiting_requesters" | "booked" | "past";
  headline: string;
  title: string | null;
  suburb: string;
  hourly_rate: number | null;
  estimated_total: number | null;
  slots: string[];
  children: string;
  expires: string | null;
  expires_urgent: boolean;
  requester_count: number | null; // only populated when we have it
}

function summariseNannyJob(job: NannyBabysittingJob): NannyJobSummary {
  const bucket = nannyJobBucket(job.notification, job.status);
  const { text: expires, urgent } = expiryText(job.expires_at);
  return {
    id: job.id,
    bucket,
    headline: bucketHeadline(bucket, "nanny"),
    title: job.title,
    suburb: job.suburb,
    distance: distanceText(job.notification.distanceKm),
    hourly_rate: job.hourly_rate,
    estimated_total: job.estimated_total,
    slots: job.slots.map((s) => formatSlot(s)),
    children: childrenSummary(job.children),
    special_requirements: job.special_requirements,
    expires,
    expires_urgent: urgent,
    clash_warning: job.clashSlotIds.length > 0,
  };
}

// Parent-side uses a lighter shape that the ParentBabysittingRequests
// server action already provides. Typed as Record-ish here because the
// exported type surface from babysitting.ts is broader and duplicating
// it would drift — the fields we actually read are narrow and typed
// via the indexer.
interface ParentBsrRow {
  id: string;
  title: string | null;
  suburb: string;
  hourly_rate: number | null;
  estimated_total: number | null;
  status: string;
  expires_at: string | null;
  children: Array<{ age_months: number; gender: string | null }> | null;
  slots?: Array<{
    id: string;
    slot_date: string;
    start_time: string;
    end_time: string;
    is_selected: boolean;
  }>;
  requesting_count?: number | null;
}

function summariseParentRequest(row: ParentBsrRow): ParentRequestSummary {
  const bucket = parentRequestBucket(row.status);
  const { text: expires, urgent } = expiryText(row.expires_at);
  return {
    id: row.id,
    bucket,
    headline: bucketHeadline(bucket, "parent"),
    title: row.title,
    suburb: row.suburb,
    hourly_rate: row.hourly_rate,
    estimated_total: row.estimated_total,
    slots: (row.slots ?? []).map((s) => formatSlot(s)),
    children: childrenSummary(row.children ?? []),
    expires,
    expires_urgent: urgent,
    requester_count: row.requesting_count ?? null,
  };
}

function roleOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "Babysitting requests are only available for nanny and parent accounts.",
  };
}

function nannyOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "That's a nanny-side view. Ask the parent's own surface instead, or check their babysitting requests via read_my_requests.",
  };
}

function parentOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "That's a parent-side view. Nannies see their own job invitations via read_my_jobs.",
  };
}

// ── Read tools ────────────────────────────────────────────────────────────

async function readMyJobs(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
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
      // Only return non-empty buckets in the ordered list Katie will
      // read back, so she narrates what's relevant without mentioning
      // empty sections.
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
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") return parentOnlyError();

  const result = await getParentBabysittingRequests();
  if (result.error) return { success: false, error: result.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  ctx: Parameters<BloomBotModule["execute"]>[2],
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
    return { success: true, data: summariseNannyJob(job) };
  }

  // parent
  const result = await getParentBabysittingRequests();
  if (result.error) return { success: false, error: result.error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result.data as unknown as ParentBsrRow[]) ?? [];
  const row = rows.find((r) => r.id === jobId);
  if (!row) {
    return {
      success: false,
      error: `No babysitting request found with id "${jobId}" on your account.`,
    };
  }
  return { success: true, data: summariseParentRequest(row) };
}

// ── Module export ─────────────────────────────────────────────────────────

export const bsrModule: BloomBotModule = {
  id: "bsr",
  name: "Babysitting Requests",
  description:
    "Read-only view of the babysitting-request pipeline — nanny job invitations + parent requests. Translates internal status, distances, timestamps, and expiry into plain English. Writes (request/accept/decline/cancel) are deferred; Katie routes those to the main inbox.",

  rolesAllowed: ["nanny", "parent"],

  tools: [
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
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_my_jobs") return readMyJobs(args, ctx);
    if (toolName === "read_my_requests") return readMyRequests(args, ctx);
    if (toolName === "read_job_detail") return readJobDetail(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "For anything about babysitting requests (one-off jobs, BSRs, 'sitters'), call the bsr tools:\n" +
    "• Nanny: 'any babysitting?' / 'who's waiting on me?' → `read_my_jobs`. Narrate the active buckets that have content (skip empty ones). If the user is banned, the tool returns `ban_text` — relay that verbatim.\n" +
    "• Parent: 'what babysitters have I booked?' / 'any open requests?' → `read_my_requests`.\n" +
    "• Either: 'tell me more about the Saturday one' / user references a specific job → `read_job_detail` with the id from the prior read.\n\n" +
    "Hard rules:\n" +
    "• NEVER say raw status values ('pending_payment', 'awaiting_parent_choice', 'nanny_cancelled'), internal fields, or timestamps. The tools return pre-rendered strings (`headline`, `expires`, `slots[]`, `distance`, `children`) — surface them directly.\n" +
    "• NEVER say 'bsr_banned_until', '3-strike', etc. If a nanny is banned, the `ban_text` field already reads well.\n" +
    "• NEVER expose a nanny's phone or a parent's address. The tools don't return phone/address fields at all — if asked, tell the user contact details appear on the main babysitting page once a booking is confirmed.\n" +
    "• Expiry is urgent when `expires_urgent: true`. Flag urgency in the narration ('about 4 hours left — worth responding quickly').\n\n" +
    "WRITES ARE NOT WIRED in this phase. If the user asks Katie to request a job, accept/decline a nanny, cancel, withdraw, or post a new request, tell them that flow still lives on the main babysitting pages (`/nanny/babysitting` for nannies, `/parent/babysitting` for parents) and offer to read the specific job first with `read_job_detail` so they know what they're acting on.",
};
