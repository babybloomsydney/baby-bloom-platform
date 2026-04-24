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
    // Distinguish "auth service errored" (500) from "no signed-in user" (401)
    // so the tile + logs can tell them apart. Swallowing this would mean a
    // misconfigured SUPABASE key looks identical to a logged-out visitor.
    console.error("[chat/connections] auth.getUser error:", error);
    return {
      ok: false,
      status: 500,
      error: "Auth lookup failed — please try again in a moment.",
    };
  }
  if (!data.user) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, userId: data.user.id };
}

async function resolveRole(
  userId: string,
): Promise<
  | { ok: true; role: ConnectionRole }
  | { ok: false; status: number; error: string }
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // DB failure vs "user has no role" are operationally different and should
    // produce different status codes so the client can distinguish.
    console.error("[chat/connections] user_roles lookup error:", error);
    return {
      ok: false,
      status: 500,
      error: "Role lookup failed — please try again.",
    };
  }
  const role = (data as { role?: string } | null)?.role;
  if (role === "nanny" || role === "parent") return { ok: true, role };
  return { ok: false, status: 403, error: "role not found" };
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

  const roleResult = await resolveRole(auth.userId);
  if (!roleResult.ok) {
    return NextResponse.json(
      { error: roleResult.error },
      { status: roleResult.status },
    );
  }
  const role = roleResult.role;

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

  const connection: ConnectionRequestWithDetails | undefined = (
    list.data ?? []
  ).find((r) => r.id === id);
  if (!connection) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const counterparty = role === "nanny" ? connection.parent : connection.nanny;
  // Missing join is a data-integrity problem — worth surfacing rather than
  // silently rendering "Unknown" as a legitimate name. Log for ops; return
  // 500 so the tile shows an error state instead of a convincing-looking
  // wrong name. (Before: fallback to "Them" / "Unknown" silently.)
  if (!counterparty || !counterparty.first_name) {
    console.error(
      "[chat/connections] enriched connection missing counterparty first_name",
      { connectionId: connection.id, role },
    );
    return NextResponse.json(
      { error: "connection data incomplete — please refresh" },
      { status: 500 },
    );
  }
  const firstName = counterparty.first_name;
  const lastName = counterparty.last_name ?? "";
  const displayName = counterpartyDisplayName(firstName, lastName);
  const suburb = counterparty.suburb ?? null;

  const headline = stageHeadline(connection.connection_stage, role, {
    counterpartyName: displayName,
    fillInitiatedBy: connection.fill_initiated_by,
  });
  const nextStep = nextStepForUser(connection.connection_stage, role, {
    fillInitiatedBy: connection.fill_initiated_by,
  });
  const left = timeLeft(connection.expires_at);

  // nanny_phone is only shared to the parent side, and only once the
  // connection has reached a scheduled stage (the underlying column is set
  // by scheduleConnectionTime and null before then, so any non-null value
  // here is already gated by the server action).
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
    confirmedTime: connection.confirmed_time,
    nannyPhone: nannyPhoneForParent,
    positionSummary: connection.position ?? null,
  });
}
