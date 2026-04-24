/**
 * GET /api/chat/connections/[id] — returns a single connection
 * enriched + translated to plain English, role-aware, for Katie's
 * inline ConnectionRequestTile.
 *
 * This is the "id-only tile" endpoint — the tile ships only a
 * connection id in its data payload, then fetches here on mount and on
 * focus so the chat view never drifts from the main-site view of the
 * same connection.
 *
 * Access control: returns 404 if the connection doesn't belong to the
 * caller (either as the parent or the nanny side). We reuse the
 * existing server actions — they already apply parent_id / nanny_id
 * scoping, so the admin-client fetch underneath is safe.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";
import {
  getNannyConnectionRequests,
  getParentConnectionRequests,
  type ConnectionRequestWithDetails,
} from "@/lib/actions/connection";
import {
  stageHeadline,
  nextStepForUser,
  timeLeft,
  counterpartyDisplayName,
  type ConnectionRole,
} from "@/lib/chat/modules/connections-translator";

export const runtime = "nodejs";

async function getAuthUser() {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

async function resolveRole(userId: string): Promise<ConnectionRole | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role === "nanny" || role === "parent") return role;
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = await resolveRole(user.id);
  if (!role) {
    return NextResponse.json({ error: "role not found" }, { status: 403 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const list =
    role === "nanny"
      ? await getNannyConnectionRequests()
      : await getParentConnectionRequests();
  if (list.error) {
    return NextResponse.json({ error: list.error }, { status: 500 });
  }

  const connection: ConnectionRequestWithDetails | undefined = list.data.find(
    (r) => r.id === id,
  );
  if (!connection) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const counterparty = role === "nanny" ? connection.parent : connection.nanny;
  const firstName = counterparty?.first_name ?? "Them";
  const lastName = counterparty?.last_name ?? "";
  const displayName = counterpartyDisplayName(firstName, lastName);
  const suburb = counterparty?.suburb ?? null;

  const headline = stageHeadline(connection.connection_stage, role, {
    counterpartyName: displayName,
    fillInitiatedBy: connection.fill_initiated_by,
  });
  const nextStep = nextStepForUser(connection.connection_stage, role, {
    fillInitiatedBy: connection.fill_initiated_by,
  });
  const left = timeLeft(connection.expires_at);

  const confirmedTime =
    role === "parent" ? connection.confirmed_time : connection.confirmed_time; // Same on both sides; nanny-phone-shared gating happens below.
  const nannyPhoneForParent =
    role === "parent" ? connection.nanny_phone_shared : null;

  return NextResponse.json({
    id: connection.id,
    role,
    counterpartyName: displayName,
    suburb,
    headline,
    nextStep,
    timeLeft: left,
    confirmedTime,
    nannyPhone: nannyPhoneForParent,
    positionSummary: connection.position ?? null,
  });
}
