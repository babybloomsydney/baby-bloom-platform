/**
 * GET /api/chat/job-matches/[id] — returns a single DFY match
 * notification by id, nanny-only. Live-fetch endpoint for the
 * id-only `job_match` tile.
 *
 * Mirrors the summariseMatch shape used by the job-search module;
 * never returns the parent's last_name, address, or any internal
 * match_score / dfy_tier fields.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";
import {
  getDfyNotificationsForNanny,
  type DfyNotification,
} from "@/lib/actions/matching";
import {
  distanceText,
  childrenSummary,
} from "@/lib/chat/modules/bsr-translator";

export const runtime = "nodejs";

async function getAuthUser(): Promise<
  { ok: true; userId: string } | { ok: false; status: number; error: string }
> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[chat/job-matches] auth.getUser error:", error);
    return {
      ok: false,
      status: 500,
      error: "Auth lookup failed — please try again in a moment.",
    };
  }
  if (!data.user) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, userId: data.user.id };
}

async function requireNannyRole(
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[chat/job-matches] user_roles lookup error:", error);
    return {
      ok: false,
      status: 500,
      error: "Role lookup failed — please try again.",
    };
  }
  const role = (data as { role?: string } | null)?.role;
  if (role !== "nanny") {
    return { ok: false, status: 403, error: "nanny-only" };
  }
  return { ok: true };
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

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const auth = await getAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const roleResult = await requireNannyRole(auth.userId);
  if (!roleResult.ok) {
    return NextResponse.json(
      { error: roleResult.error },
      { status: roleResult.status },
    );
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const result = await getDfyNotificationsForNanny();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  const match = (result.data ?? []).find((n) => n.id === id);
  if (!match) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: match.id,
    position_id: match.positionId,
    suburb: match.position.suburb,
    distance: distanceText(match.distanceKm),
    hours_per_week: match.position.hoursPerWeek,
    hourly_rate: match.position.hourlyRate,
    days_required: match.position.daysRequired ?? [],
    urgency: match.position.urgency,
    start_date: match.position.startDate,
    children: childrenSummary(
      match.position.children.map((c) => ({
        age_months: c.ageMonths,
        gender: c.gender,
      })),
    ),
    parent_first_name: match.parent.firstName,
    requirements: summariseRequirements(match.position),
    description: match.position.description,
    reason_for_nanny: match.position.reasonForNanny ?? [],
    level_of_support: match.position.levelOfSupport ?? [],
    placement_length: match.position.placementLength,
  });
}
