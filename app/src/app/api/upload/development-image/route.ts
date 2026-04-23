import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "development-images";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const childId = formData.get("childId") as string | null;

    if (!file || !childId) {
      return NextResponse.json(
        { error: "Missing file or childId" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 10MB" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${childId}/${crypto.randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Development image upload error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("Development image upload unexpected error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
