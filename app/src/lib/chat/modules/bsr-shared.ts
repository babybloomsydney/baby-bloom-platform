/**
 * Shared helpers for the BSR module — types, summarise functions, role
 * gate helpers. Imported by `bsr-reads.ts`, `bsr-writes-nanny.ts`, and
 * `bsr-writes-parent.ts`. The public module definition lives in `bsr.ts`.
 */

import type { BloomBotModule, ToolResult } from "./types";
import type { NannyBabysittingJob } from "@/lib/actions/babysitting";
import {
  nannyJobBucket,
  parentRequestBucket,
  bucketHeadline,
  expiryText,
  distanceText,
  formatSlot,
  childrenSummary,
} from "./bsr-translator";

// ── Shape types ───────────────────────────────────────────────────────────

export interface NannyJobSummary {
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

export interface ParentRequestSummary {
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
  requester_count: number | null;
}

/**
 * Parent-side BSR row shape the module uses. The server action type
 * surface is broader; duplicating it in full would drift. We only
 * read the narrow fields listed here.
 */
export interface ParentBsrRow {
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

// ── Shape mappers ─────────────────────────────────────────────────────────

export function summariseNannyJob(job: NannyBabysittingJob): NannyJobSummary {
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

export function summariseParentRequest(
  row: ParentBsrRow,
): ParentRequestSummary {
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

// ── Role gate errors ──────────────────────────────────────────────────────

export function roleOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "Babysitting requests are only available for nanny and parent accounts.",
  };
}

export function nannyOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "That's a nanny-side action. Only nannies can request / decline / withdraw / cancel babysitting jobs.",
  };
}

export function parentOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "That's a parent-side action. Only parents can accept / decline requesting nannies or cancel their own requests.",
  };
}

// Re-export for handler type signatures.
export type BsrModuleContext = Parameters<BloomBotModule["execute"]>[2];
