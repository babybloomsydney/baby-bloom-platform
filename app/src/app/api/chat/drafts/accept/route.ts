/**
 * POST /api/chat/drafts/accept — commits a draft tile.
 *
 * The chat client calls this when the user clicks Accept on a
 * draft tile. We dispatch to the relevant module's `apply_X`
 * function, which validates the args, inserts the underlying row,
 * and returns the persisted ChatTile. The frontend then replaces
 * the draft tile on the host chat message with the persisted one.
 *
 * Body: { toolName: string, args: Record<string, unknown>, imageUrl?: string | null }
 * Returns: { tile: ChatTile, data: Record<string, unknown> } on success
 *          { error: string } on failure (4xx / 5xx)
 *
 * Auth: signed-in user with a recognised app role. KATIE_ENABLED
 * gate up front. Children are loaded server-side from the auth
 * uid — never trusted from the request body, even though the args
 * may name a child.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";
import { getUserChildren } from "@/lib/chat/bot";
import { applyDraft } from "@/lib/chat/drafts/apply";

export const runtime = "nodejs";

interface AcceptBody {
  /** Client-generated id from the draft tile — sent for future dedup. */
  draftId: string;
  toolName: string;
  args: Record<string, unknown>;
  imageUrl?: string | null;
}

// Cap on `toolName` so a runaway client can't push a 100KB string
// that ends up echoed back in our 422 error body. 64 chars is well
// over the longest real toolName we'll ever ship.
const MAX_TOOL_NAME_LENGTH = 64;

function isAcceptBody(value: unknown): value is AcceptBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.draftId !== "string" || v.draftId.length === 0) return false;
  if (
    typeof v.toolName !== "string" ||
    v.toolName.length === 0 ||
    v.toolName.length > MAX_TOOL_NAME_LENGTH
  ) {
    return false;
  }
  if (!v.args || typeof v.args !== "object") return false;
  if (
    v.imageUrl !== undefined &&
    v.imageUrl !== null &&
    typeof v.imageUrl !== "string"
  ) {
    return false;
  }
  return true;
}

/**
 * Bucket-origin allowlist. The chat client uploads images via
 * /api/chat/upload, which writes to the existing `development-images`
 * Supabase Storage bucket and returns a public URL. We accept ONLY
 * those URLs here (or null) — without this gate, a malicious client
 * could persist arbitrary external URLs into bapp_logs.data.image_url
 * and tiles would render them as <img src> for any user of the
 * shared child feed (privacy + SVG-script risk).
 *
 * The expected URL prefix is the public Storage URL pattern:
 *   https://{ref}.supabase.co/storage/v1/object/public/development-images/...
 *
 * Built once from the env var so misconfiguration in dev fails fast.
 */
const SUPABASE_PUBLIC_URL = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return raw.replace(/\/+$/, "");
})();

function isAllowedImageUrl(url: string | null | undefined): boolean {
  if (url == null) return true;
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  // Must be on the configured Supabase project's storage path. Compare
  // against the env-derived origin to avoid hard-coding the project ref.
  if (!SUPABASE_PUBLIC_URL) return false;
  const expectedPrefix = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/development-images/`;
  return url.startsWith(expectedPrefix);
}

export async function POST(request: Request) {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Auth
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("[chat/drafts/accept] auth.getUser error:", authError);
    return NextResponse.json(
      { error: "Auth lookup failed — please try again." },
      { status: 500 },
    );
  }
  if (!authData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = authData.user.id;

  // Role gate — same allowlist as the upload route.
  const admin = createAdminClient();
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleErr) {
    console.error("[chat/drafts/accept] user_roles lookup error:", roleErr);
    return NextResponse.json(
      { error: "Role lookup failed — please try again." },
      { status: 500 },
    );
  }
  const role = (roleRow as { role?: string } | null)?.role;
  if (role !== "nanny" && role !== "parent" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isAcceptBody(body)) {
    return NextResponse.json(
      { error: "Body must be { draftId, toolName, args, imageUrl? }." },
      { status: 400 },
    );
  }

  if (!isAllowedImageUrl(body.imageUrl)) {
    return NextResponse.json(
      {
        error: "image_url must be from this site's Storage bucket (or null).",
      },
      { status: 400 },
    );
  }

  // Children — loaded server-side via the existing auth-scoped helper.
  // Apply functions resolve a child by name from this list; they
  // cannot reach across to other users' children. (Loaded fresh per
  // accept; cache here in 8.22d if throughput warrants.)
  const children = await getUserChildren(userId);

  const result = await applyDraft(
    body.toolName,
    body.args,
    body.imageUrl ?? null,
    { userId, children, supabase: admin },
  );

  if (!result.ok) {
    // Apply errors are user-visible: invalid args, missing child,
    // failed insert. 422 keeps it distinct from 4xx body issues
    // and 5xx server faults.
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    tile: result.tile,
    data: result.data,
    // Surface warnings when the row persisted but a side-effect
    // (e.g., progress cascade) failed. The frontend treats this
    // as a non-fatal notice, not an error toast.
    ...(result.warning ? { warning: result.warning } : {}),
  });
}
