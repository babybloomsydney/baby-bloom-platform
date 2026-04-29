/**
 * GET /api/chat/connections/[id] — returns the raw connection
 * (`ConnectionRequestWithDetails`) plus the viewer role.
 *
 * Architectural commitment: the chat ConnectionRequestTile renders
 * the SAME `<ConnectionTile />` component as the main connections
 * page. So this endpoint hands the tile the exact shape that the
 * page receives from `getNanny|getParentConnectionRequests` — no
 * translation. Translation/headlines for AI text responses still
 * live in `connections-translator.ts`; that path is unaffected.
 *
 * Access control: returns 404 if the connection doesn't belong to
 * the caller. We reuse the existing server actions — they already
 * scope by parent_id / nanny_id, so any record returned here is
 * guaranteed to belong to the user.
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

export const runtime = "nodejs";

type ViewerRole = "nanny" | "parent";

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
  { ok: true; role: ViewerRole } | { ok: false; status: number; error: string }
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
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

  return NextResponse.json({
    id: connection.id,
    role,
    connection,
  });
}
