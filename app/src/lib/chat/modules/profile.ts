/**
 * `profile` module — Katie's read view on the user's own profile
 * (nanny or parent), plus a small write surface for low-risk scalar
 * updates.
 *
 * Phase 4A v1 scope:
 *   - read_my_profile          (role-aware snapshot)
 *   - read_my_position         (parent only — their active position)
 *   - read_my_placement        (parent only — who their nanny is)
 *   - propose_/apply_update_rate         (nanny — two-turn)
 *   - propose_/apply_update_age_range    (nanny — two-turn, matching signal)
 *
 * Out of scope (deferred):
 *   - AI bio / headline regeneration (regenerateNannyAIContent) — async +
 *     paid + 24h rate-limited; needs its own flow.
 *   - Position creation / editing (saveTypeformPosition) — 42 fields; the
 *     audit recommends deep-linking to /parent/request for new positions
 *     and handling inline edits section-by-section, which is its own
 *     phase.
 *   - Availability schedule edits > 3 cells — routes to the main form.
 *   - Photo upload — requires file bytes, can't travel via chat text.
 *   - Account deactivation / email change / security — handled on the
 *     settings page.
 *
 * Hard rules — match the audit at
 * system/APP/BLOOMBOT/modules/profile-nanny/katie-scope.md and
 * profile-parent/katie-scope.md:
 *   1. Never expose internal column names (`verification_level`,
 *      `visible_in_match_making`, `visible_in_bsr`, `status`,
 *      `profile_visible`, `last_regenerated_at`, `ai_model`, etc.).
 *   2. Never surface the deprecated `verification_tier` values.
 *   3. Never surface V1 legacy fields (`hobbies_interests`,
 *      `strengths_traits`, `skills_training`, `experience_details`) —
 *      always null for V2 users.
 *   4. Rate range is 20–200. Ages in months; min/max window 0–180.
 *   5. Verification narration lives on the verification module, not here
 *      — this module just exposes whether the profile is "visible to
 *      parents yet" at a high level.
 */

import type { BloomBotModule, ToolResult } from "./types";
import {
  getNannyProfile,
  updateNannyProfile,
  type NannyProfile,
} from "@/lib/actions/nanny";
import { getPosition } from "@/lib/actions/parent";
import { getParentPlacement } from "@/lib/actions/position-funnel";

type ProfileRole = "nanny" | "parent";

const RATE_MIN = 20;
const RATE_MAX = 200;
const AGE_MIN = 0;
const AGE_MAX = 180;

function resolveRole(effectiveRole: string): ProfileRole | null {
  if (effectiveRole === "nanny" || effectiveRole === "parent")
    return effectiveRole;
  return null;
}

function roleOnlyError(): ToolResult {
  return {
    success: false,
    error:
      "Profile tools are only available for nanny and parent accounts. Admin views use the admin inspection tools.",
  };
}

function nannyOnlyError(action: string): ToolResult {
  return {
    success: false,
    error: `Only nannies can ${action}. Parent account settings live on the settings page.`,
  };
}

function parentOnlyError(action: string): ToolResult {
  return {
    success: false,
    error: `Only parents can ${action}.`,
  };
}

// ── Shape mappers ─────────────────────────────────────────────────────────

function monthsToReadable(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} year${years === 1 ? "" : "s"}`;
  return `${years}y ${rem}m`;
}

function ageRangeText(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min == null ? `up to` : monthsToReadable(min);
  const hi = max == null ? null : monthsToReadable(max);
  if (min != null && max != null) return `${lo} – ${hi}`;
  if (min != null) return `${lo}+`;
  return `up to ${hi}`;
}

/**
 * Translate a nanny's verification_level + visible_in_bsr into
 * plain-English visibility text. Never leaks the level number or the
 * column name.
 *
 * Provisional (level 3) UX rule carries over from the verification
 * module: "your profile is live" rather than "your WWCC is pending".
 */
function nannyVisibilityText(
  level: number | null | undefined,
  visibleInBsr: boolean | null | undefined,
): string {
  if (level == null || level === 0) {
    return "Your account is set up but you haven't started verification yet — parents can't see you until that's done.";
  }
  if (level === 1) {
    return "Your profile is complete. The next step is to verify your ID before parents can see you.";
  }
  if (level === 2) {
    return "Your ID is verified. Next up is the Working With Children Check — once that passes, your profile goes live to parents.";
  }
  if (level === 3) {
    // Provisional — see memory: no "pending final check" language unless asked.
    return visibleInBsr
      ? "Your profile is live — parents can find you in search and request you for babysitting jobs."
      : "Your profile is live — parents can find you in search.";
  }
  // level >= 4
  return visibleInBsr
    ? "Your profile is fully verified — you're visible to parents for regular placements and babysitting jobs."
    : "Your profile is fully verified and visible to parents for regular placements.";
}

interface NannySnapshot {
  role: "nanny";
  first_name: string;
  suburb: string | null;
  hourly_rate: string;
  age_range: string | null;
  max_children: number | null;
  role_types: string[];
  level_of_support: string[];
  available_days: string[];
  photo_count: number;
  visibility: string;
  bio_last_updated: string | null;
}

function nannySnapshot(profile: NannyProfile): NannySnapshot {
  const rate =
    profile.hourly_rate_min != null
      ? `$${profile.hourly_rate_min}/hour`
      : "Not set yet";
  const age = ageRangeText(
    profile.min_child_age_months,
    profile.max_child_age_months,
  );

  const photos = [
    profile.profile_picture_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any).photo_1_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any).photo_2_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any).photo_3_url,
  ].filter((url): url is string => typeof url === "string" && url.length > 0);

  return {
    role: "nanny",
    first_name: profile.first_name ?? "",
    suburb: profile.suburb ?? null,
    hourly_rate: rate,
    age_range: age,
    max_children: profile.max_children,
    role_types: profile.role_types_preferred ?? [],
    level_of_support: profile.level_of_support_offered ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    available_days: (profile as any).available_days ?? [],
    photo_count: photos.length,
    visibility: nannyVisibilityText(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profile as any).verification_level,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profile as any).visible_in_bsr,
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bio_last_updated: (profile as any).ai_content?.generated_at ?? null,
  };
}

// ── Read tools ────────────────────────────────────────────────────────────

async function readMyProfile(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();

  if (role === "nanny") {
    const { data, error } = await getNannyProfile();
    if (error) return { success: false, error };
    if (!data) {
      return {
        success: false,
        error:
          "We couldn't find your nanny profile. Contact support if this persists.",
      };
    }
    return { success: true, data: nannySnapshot(data) };
  }

  // Parent: blend account + position + placement into one snapshot.
  const [positionRes, placementRes] = await Promise.all([
    getPosition(),
    getParentPlacement(),
  ]);

  if (positionRes.error) return { success: false, error: positionRes.error };
  if (placementRes.error) return { success: false, error: placementRes.error };

  const position = positionRes.data;
  const placement = placementRes.data;

  return {
    success: true,
    data: {
      role: "parent",
      has_active_position: position != null,
      position_summary: position
        ? {
            suburb: position.suburb ?? null,
            hours_per_week: position.hours_per_week ?? null,
            days_required: position.days_required ?? [],
            num_children: position.children.length,
            hourly_rate: position.hourly_rate ?? null,
          }
        : null,
      has_active_placement: placement != null,
      placement_summary: placement
        ? {
            nanny_name: placement.nannyName,
            nanny_suburb: placement.nannySuburb,
            weekly_hours: placement.weeklyHours,
            hourly_rate: placement.hourlyRate,
            hired_at: placement.hiredAt,
          }
        : null,
    },
  };
}

async function readMyPosition(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") return parentOnlyError("read their position");

  const { data, error } = await getPosition();
  if (error) return { success: false, error };
  if (!data) {
    return {
      success: true,
      data: {
        has_active_position: false,
        summary:
          "You don't have an active position yet. Want to create one? I'll open the form for you.",
      },
    };
  }

  return {
    success: true,
    data: {
      has_active_position: true,
      position: {
        suburb: data.suburb ?? null,
        urgency: data.urgency ?? null,
        start_date: data.start_date ?? null,
        hours_per_week: data.hours_per_week ?? null,
        days_required: data.days_required ?? [],
        hourly_rate: data.hourly_rate ?? null,
        num_children: data.children.length,
        children_ages_months: data.children
          .map((c) => c.age_months)
          .filter((m): m is number => typeof m === "number"),
      },
    },
  };
}

async function readMyPlacement(
  _args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "parent") return parentOnlyError("read their placement");

  const { data, error } = await getParentPlacement();
  if (error) return { success: false, error };
  if (!data) {
    return {
      success: true,
      data: {
        has_active_placement: false,
        summary:
          "You don't have a nanny placed right now. When you confirm a connection, they'll show up here.",
      },
    };
  }

  return {
    success: true,
    data: {
      has_active_placement: true,
      placement: {
        nanny_name: data.nannyName,
        nanny_suburb: data.nannySuburb,
        weekly_hours: data.weeklyHours,
        hourly_rate: data.hourlyRate,
        hired_at: data.hiredAt,
        start_date: data.startDate,
      },
    },
  };
}

// ── Writes — nanny scalar fields (two-turn confirm) ──────────────────────

function validateRate(
  raw: unknown,
): { ok: true; rate: number } | { ok: false; error: string } {
  const rate = typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(rate)) {
    return { ok: false, error: "Pass `hourly_rate` as a number." };
  }
  if (rate < RATE_MIN || rate > RATE_MAX) {
    return {
      ok: false,
      error: `Hourly rate must be between $${RATE_MIN} and $${RATE_MAX}/hour.`,
    };
  }
  // Quietly round to one decimal place — rates aren't usually more granular.
  return { ok: true, rate: Math.round(rate * 100) / 100 };
}

async function proposeUpdateRate(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError("change their hourly rate");

  const r = validateRate(args.hourly_rate);
  if (!r.ok) return { success: false, error: r.error };

  return {
    success: true,
    data: {
      action: "update_rate",
      hourly_rate: r.rate,
      email_side_effect: false,
      preview: `You're about to update your public hourly rate to $${r.rate}/hour. Parents browsing Baby Bloom will see this rate on your profile.`,
      next_call:
        "Read the preview back, ask yes/cancel, then on yes call apply_update_rate with the same hourly_rate.",
    },
  };
}

async function applyUpdateRate(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError("change their hourly rate");

  const r = validateRate(args.hourly_rate);
  if (!r.ok) return { success: false, error: r.error };

  const result = await updateNannyProfile({ hourly_rate_min: r.rate });
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to update your rate.",
    };
  }

  return {
    success: true,
    data: {
      action: "update_rate",
      hourly_rate: r.rate,
      message: `Done — your profile now shows $${r.rate}/hour.`,
    },
  };
}

function validateAgeRange(
  args: Record<string, unknown>,
): { ok: true; min: number; max: number } | { ok: false; error: string } {
  const min =
    typeof args.min_months === "number" ? Math.round(args.min_months) : NaN;
  const max =
    typeof args.max_months === "number" ? Math.round(args.max_months) : NaN;
  if (!Number.isFinite(min) || min < AGE_MIN || min > AGE_MAX) {
    return {
      ok: false,
      error: `\`min_months\` must be a number between ${AGE_MIN} and ${AGE_MAX}.`,
    };
  }
  if (!Number.isFinite(max) || max < AGE_MIN || max > AGE_MAX) {
    return {
      ok: false,
      error: `\`max_months\` must be a number between ${AGE_MIN} and ${AGE_MAX}.`,
    };
  }
  if (min > max) {
    return {
      ok: false,
      error: `\`min_months\` (${min}) can't be greater than \`max_months\` (${max}).`,
    };
  }
  return { ok: true, min, max };
}

async function proposeUpdateAgeRange(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError("change their age range");

  const r = validateAgeRange(args);
  if (!r.ok) return { success: false, error: r.error };

  const human = ageRangeText(r.min, r.max);
  return {
    success: true,
    data: {
      action: "update_age_range",
      min_months: r.min,
      max_months: r.max,
      email_side_effect: false,
      preview: `You're about to set your preferred child age range to ${human}. This feeds the matchmaking algorithm — families looking outside this range won't see you, and families within it will. Want me to go ahead?`,
      next_call:
        "Read the preview back — call out that this shifts who sees you — then on a yes call apply_update_age_range with the same min_months + max_months.",
    },
  };
}

async function applyUpdateAgeRange(
  args: Record<string, unknown>,
  ctx: Parameters<BloomBotModule["execute"]>[2],
): Promise<ToolResult> {
  const role = resolveRole(ctx.effectiveRole);
  if (!role) return roleOnlyError();
  if (role !== "nanny") return nannyOnlyError("change their age range");

  const r = validateAgeRange(args);
  if (!r.ok) return { success: false, error: r.error };

  const result = await updateNannyProfile({
    min_child_age_months: r.min,
    max_child_age_months: r.max,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Failed to update your age range.",
    };
  }

  return {
    success: true,
    data: {
      action: "update_age_range",
      min_months: r.min,
      max_months: r.max,
      message: `Done — your profile now takes ages ${ageRangeText(r.min, r.max)}.`,
    },
  };
}

// ── Module export ─────────────────────────────────────────────────────────

export const profileModule: BloomBotModule = {
  id: "profile",
  name: "Profile",
  description:
    "Reads the user's own profile (nanny or parent) and applies low-risk scalar updates. Position editing, AI bio regeneration, photo uploads, and account deactivation live outside this module.",

  rolesAllowed: ["nanny", "parent"],

  tools: [
    {
      name: "read_my_profile",
      description:
        "Return a plain-English snapshot of the signed-in user's profile. For nannies: first name, suburb, hourly rate, age range, role types, availability days, photo count, and a visibility line (are parents currently able to see them, in plain English). For parents: home suburb, whether they have an active position, whether they have a placed nanny. Never leaks internal field names.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_my_position",
      description:
        "Parent-only. Return the parent's active position — suburb, hours/week, days, urgency, start date, hourly rate, number + ages of children. Returns has_active_position=false if they haven't created one.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_my_placement",
      description:
        "Parent-only. Return the currently-placed nanny — their name, suburb, weekly hours, hourly rate, hire date. Returns has_active_placement=false if no active placement.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "propose_update_rate",
      description:
        "Preview changing the signed-in nanny's hourly rate (nanny-only). Validates $20-$200. Returns a preview line for the user to confirm. Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          hourly_rate: {
            type: "number",
            description: "New hourly rate in AUD. 20 ≤ rate ≤ 200.",
          },
        },
        required: ["hourly_rate"],
      },
    },
    {
      name: "apply_update_rate",
      description:
        "Actually set the nanny's hourly rate. Only call after propose_update_rate and explicit user confirmation.",
      parameters: {
        type: "object",
        properties: {
          hourly_rate: { type: "number" },
        },
        required: ["hourly_rate"],
      },
    },
    {
      name: "propose_update_age_range",
      description:
        "Preview changing the signed-in nanny's preferred child age range (nanny-only). min_months and max_months are both in MONTHS (0-180). Flags in the preview that this changes matchmaking visibility. Does NOT hit the server.",
      parameters: {
        type: "object",
        properties: {
          min_months: {
            type: "number",
            description: "Minimum child age in months (0-180).",
          },
          max_months: {
            type: "number",
            description:
              "Maximum child age in months (0-180). Must be ≥ min_months.",
          },
        },
        required: ["min_months", "max_months"],
      },
    },
    {
      name: "apply_update_age_range",
      description:
        "Actually set the nanny's preferred age range. Only call after propose_update_age_range + explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          min_months: { type: "number" },
          max_months: { type: "number" },
        },
        required: ["min_months", "max_months"],
      },
    },
  ],

  async execute(toolName, args, ctx) {
    if (toolName === "read_my_profile") return readMyProfile(args, ctx);
    if (toolName === "read_my_position") return readMyPosition(args, ctx);
    if (toolName === "read_my_placement") return readMyPlacement(args, ctx);
    if (toolName === "propose_update_rate") return proposeUpdateRate(args, ctx);
    if (toolName === "apply_update_rate") return applyUpdateRate(args, ctx);
    if (toolName === "propose_update_age_range")
      return proposeUpdateAgeRange(args, ctx);
    if (toolName === "apply_update_age_range")
      return applyUpdateAgeRange(args, ctx);
    return { success: false, error: `Unknown tool: ${toolName}` };
  },

  systemPromptFragment:
    "For anything about the user's own profile / position / placement, call the profile tools:\n" +
    "• 'Show me my profile', 'what does my profile say', 'how's my account looking' → `read_my_profile`.\n" +
    "• Parent asking about their position specifically → `read_my_position`.\n" +
    "• Parent asking 'who's my nanny' / 'do I have a nanny yet' → `read_my_placement`.\n\n" +
    "Hard rules:\n" +
    "• NEVER speak `verification_level`, `verification_tier`, `status`, `visible_in_match_making`, `visible_in_bsr`, `profile_visible`, `last_regenerated_at`, `ai_model` or any other internal column name. The read tools return plain-English strings — surface those directly.\n" +
    "• NEVER mention 'tier 1', 'tier 2', 'tier 3' — the old tier system is deprecated.\n" +
    "• NEVER refer to the V1 legacy fields `hobbies_interests`, `strengths_traits`, `skills_training`, `experience_details` — they're always null for current users.\n" +
    "• For a provisionally-verified nanny (what the product calls 'Verified'), the read tool returns 'Your profile is live' wording. DO NOT volunteer that a background check is still pending — that's the verification module's territory and only surfaces when the user specifically asks.\n\n" +
    "Writes (nanny only, both two-turn):\n" +
    "• Change hourly rate → `propose_update_rate` → confirm → `apply_update_rate`. Rate must be $20-$200.\n" +
    "• Change preferred age range → `propose_update_age_range` → confirm → `apply_update_age_range`. Ages in MONTHS (0-180). The preview flags that this changes matchmaking visibility — read that back.\n\n" +
    "Not yet wired — route the user elsewhere if they ask:\n" +
    "• Rewrite bio / regenerate profile → point to /nanny/profile (the regen flow lives there; it's paid + 24h rate-limited).\n" +
    "• Edit photos / upload new ones → /nanny/profile (needs a file picker).\n" +
    "• Full schedule change / qualification change / add certificate → /nanny/profile.\n" +
    "• Create or edit a parent position → /parent/request (42 fields, too much for chat).\n" +
    "• Deactivate account / change email → settings page.\n" +
    "• Anything about verification → this module deliberately says nothing beyond the high-level visibility line; use the verification module for details.",
};
