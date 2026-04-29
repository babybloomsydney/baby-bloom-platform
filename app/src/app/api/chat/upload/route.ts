/**
 * POST /api/chat/upload — multipart image upload for Katie's input.
 *
 * Returns a public URL the chat client can append to the next user
 * message as `[Image attached: <url>]`. Katie reads that marker as
 * text context (NOT multimodal input), deduces what kind of tile
 * the user wants from the conversation, and calls the appropriate
 * tool (`log_observation`, `log_food`, `log_sleep`, `create_tile`,
 * etc.) passing the URL as `image_url`.
 *
 * Reuses the existing `development-images` Storage bucket — same one
 * `src/lib/actions/bapp/upload-image.ts` writes child-keyed entries
 * to. Chat uploads share the bucket because:
 *   - same image lifecycle (public-read URLs embedded in tiles)
 *   - same operational surface (one bucket to monitor, back up, GC)
 *   - many chat uploads end up persisted by Katie's tools
 *     (log_observation / log_food / etc.) which reference these
 *     public URLs anyway, so a separate bucket would just split
 *     the same dataset across two locations
 *
 * Path layout (distinct prefix from child-keyed uploads):
 *   development-images/chat/{user_id}/{uuid}.{ext}
 *
 * Validation:
 *   - image content-types only (jpeg/png/webp/gif/heic)
 *   - max 10 MB (chat is for snapshots, not raw camera dumps)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";

export const runtime = "nodejs";

// Route segment config — informs Vercel of the expected request body
// size. Without this, the platform applies its default cap (4.5 MB
// on the serverless tier) which would reject 10 MB uploads at the
// edge before our handler runs. We intentionally validate again
// inside the handler in case the platform raises the cap; this is
// belt-and-braces.
export const maxDuration = 30;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
]);

const MAX_BYTES = 10 * 1024 * 1024;

const BUCKET = "development-images";
const PATH_PREFIX = "chat";

function deriveExt(file: File): string {
  // Prefer the MIME type → ext mapping; fall back to the filename
  // suffix if the type is generic. Cap to a known whitelist so a
  // user-supplied filename can't smuggle a path-traversal segment
  // into the storage key.
  const fromType = (() => {
    switch (file.type) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      case "image/heic":
        return "heic";
      case "image/heif":
        return "heif";
      default:
        return null;
    }
  })();
  if (fromType) return fromType;
  const tail = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTS.has(tail) ? tail : "bin";
}

export async function POST(request: Request) {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Auth
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("[chat/upload] auth.getUser error:", authError);
    return NextResponse.json(
      { error: "Auth lookup failed — please try again." },
      { status: 500 },
    );
  }
  if (!authData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = authData.user.id;

  // Role gate. KATIE_ENABLED is a global feature flag — it doesn't
  // tell us whether THIS user has any business uploading. Require a
  // recognised app role so a stale signed-in session for a deleted
  // / non-app user can't write into our bucket.
  const admin = createAdminClient();
  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleErr) {
    console.error("[chat/upload] user_roles lookup error:", roleErr);
    return NextResponse.json(
      { error: "Role lookup failed — please try again." },
      { status: 500 },
    );
  }
  const role = (roleRow as { role?: string } | null)?.role;
  if (role !== "nanny" && role !== "parent" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read upload — try again." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` field." },
      { status: 400 },
    );
  }

  // Validate type + size BEFORE buffering
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type (${file.type || "unknown"}).` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Image is too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`,
      },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "Image file is empty." },
      { status: 400 },
    );
  }

  // Path prefix scopes chat uploads to their own folder inside the
  // shared `development-images` bucket. The user-id segment makes
  // every object discoverable per-user (useful for housekeeping or
  // future per-user retention rules) without needing a separate
  // bucket.
  const ext = deriveExt(file);
  const path = `${PATH_PREFIX}/${userId}/${crypto.randomUUID()}.${ext}`;

  // Admin client for the upload — same pattern as the existing
  // bapp upload-image action. Bucket is publicly readable; RLS on
  // writes is bypassed by the service role. (Reusing the `admin`
  // instance from the role check above.)
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[chat/upload] storage.upload error:", uploadError);
    return NextResponse.json(
      { error: "Upload failed — try again." },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    path,
    size: file.size,
    type: file.type,
  });
}
