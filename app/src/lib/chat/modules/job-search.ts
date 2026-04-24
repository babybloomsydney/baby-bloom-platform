/**
 * `job-search` module — nanny-only read view over DFY
 * (done-for-you) match notifications.
 *
 * When a parent creates a position, the matchmaking system sends
 * notifications to matching nannies. This module surfaces those
 * notifications in plain English so Katie can narrate "3 new
 * positions matched, closest is Bondi, 30h/week, $45/hr".
 *
 * v1 scope: READ-ONLY. Applying / declining happens via the main
 * surface (`/nanny/jobs` or the connections module). The connections
 * module already owns `propose_send_connection_request` (parent-side)
 * which is the write equivalent for the other direction.
 */

import type { BloomBotModule, ToolResult } from "./types";
import {
  getDfyNotificationsForNanny,
  type DfyNotification,
} from "@/lib/actions/matching";
import { asUserFacingRole } from "./utils";
import { distanceText, childrenSummary } from "./bsr-translator";

interface JobMatchSummary {
  id: string;
  position_id: string;
  suburb: string | null;
  distance: string;
  hours_per_week: number | null;
  hourly_rate: number | null;
  days_required: string[];
  urgency: string | null;
  start_date: string | null;
  children: string;
  parent_first_name: string;
  // Plain-English tags Katie can call out. Intentionally boolean-free
  // — the prose already conveys the fact.
  requirements: string[];
}

function summariseRequirements(pos: DfyNotification["position"]): string[] {
  const out: string[] = [];
  if (pos.driversLicenseRequired) out.push("driver's license");
  if (pos.carRequired) out.push("own car");
  if (pos.vaccinationRequired) out.push("vaccinations up to date");
  if (pos.comfortableWithPetsRequired) out.push("pet-friendly");
  if (pos.nonSmokerRequired) out.push("non-smoker");
  if (pos.qualificationRequirement) {
    out.push(`qualification: ${pos.qualificationRequirement}`);
  }
  if (pos.languagePreference) {
    out.push(`language: ${pos.languagePreference}`);
  }
  return out;
}

function summariseMatch(n: DfyNotification): JobMatchSummary {
  return {
    id: n.id,
    position_id: n.positionId,
    suburb: n.position.suburb,
    distance: distanceText(n.distanceKm),
    hours_per_week: n.position.hoursPerWeek,
    hourly_rate: n.position.hourlyRate,
    days_required: n.position.daysRequired ?? [],
    urgency: n.position.urgency,
    start_date: n.position.startDate,
    children: childrenSummary(
      n.position.children.map((c) => ({
        age_months: c.ageMonths,
        gender: c.gender,
      })),
    ),
    parent_first_name: n.parent.firstName,
    requirements: summariseRequirements(n.position),
  };
}

function roleOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "Job matches are only visible on a nanny account. Parents can see their own position via read_my_position.",
  };
}

// ── Tools ─────────────────────────────────────────────────────────────────

async function readMyJobMatches(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return roleOnlyError();

  const result = await getDfyNotificationsForNanny();
  if (result.error) return { success: false, error: result.error };

  const notifications = result.data ?? [];
  const summaries = notifications.map(summariseMatch);
  return {
    success: true,
    data: {
      count: summaries.length,
      matches: summaries,
      summary:
        summaries.length === 0
          ? "No open-position matches right now. New matches appear as families post positions that fit your profile."
          : `${summaries.length} matched position${summaries.length === 1 ? "" : "s"} waiting for your response.`,
    },
  };
}

async function readJobMatchDetail(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = asUserFacingRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return roleOnlyError();

  const matchId = typeof args.match_id === "string" ? args.match_id.trim() : "";
  if (!matchId) {
    return {
      success: false,
      error:
        "Pass `match_id` — the id returned by read_my_job_matches (the notification id, not the position id).",
    };
  }

  const result = await getDfyNotificationsForNanny();
  if (result.error) return { success: false, error: result.error };
  const notifications = result.data ?? [];
  const match = notifications.find((n) => n.id === matchId);
  if (!match) {
    return {
      success: false,
      error: `No open match found with id "${matchId}" in your notifications.`,
    };
  }

  const summary = summariseMatch(match);
  return {
    success: true,
    data: {
      ...summary,
      description: match.position.description,
      reason_for_nanny: match.position.reasonForNanny ?? [],
      schedule: match.position.schedule,
      level_of_support: match.position.levelOfSupport ?? [],
      placement_length: match.position.placementLength,
    },
  };
}

// ── Module export ─────────────────────────────────────────────────────────

export const jobSearchModule: BloomBotModule = {
  id: "job-search",
  name: "Job Search",
  description:
    "Nanny-only read view over matched-position notifications (DFY matchmaking). Translates position details to plain English so Katie can surface active matches, their distance / hours / rate, and their requirements.",

  rolesAllowed: ["nanny"],

  tools: [
    {
      name: "read_my_job_matches",
      description:
        "Return the list of open positions the matchmaking system has notified this nanny about. Each entry has the suburb, distance, hours/week, hourly rate, days required, child ages, and any hard requirements (license / car / qualification etc.). Use for 'any new jobs for me?', 'what positions have I been matched to?'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_job_match_detail",
      description:
        "Return full detail for a single matched position by the match (notification) id. Includes the position description, reasons the family is hiring, weekly schedule, and level of support. Use when the nanny asks about a specific match referenced in read_my_job_matches.",
      parameters: {
        type: "object",
        properties: {
          match_id: {
            type: "string",
            description:
              "The notification id returned by read_my_job_matches (the `id` field, NOT the `position_id`).",
          },
        },
        required: ["match_id"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_my_job_matches") return readMyJobMatches(args, ctx);
    if (toolName === "read_job_match_detail")
      return readJobMatchDetail(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "For nanny questions about 'any jobs?', 'what matches do I have?', 'new positions for me', call `read_my_job_matches`. For a specific match the user named or referenced, call `read_job_match_detail` with the match id.\n\n" +
    "Hard rules:\n" +
    "• NEVER speak raw field names (`match_score`, `dfy_tier`, `respondedAt`, etc.) — the tools return plain-English text already.\n" +
    "• NEVER fabricate a parent's name — only use `parent_first_name` returned by the tool.\n" +
    "• Distances are pre-rendered (e.g. '3.5 km', '<1 km'). Don't recompute.\n" +
    "• To actually apply to a matched position, the nanny needs to go through the connection flow — parent must send the request first, or the nanny applies via the main `/nanny/jobs` page. This module is read-only.\n" +
    "• If the user asks Katie to apply / decline, tell them the apply flow still lives on `/nanny/jobs` and offer to read the specific match detail first so they know what they're applying to.",
};
