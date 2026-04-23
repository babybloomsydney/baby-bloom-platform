"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function uploadImage(
  formData: FormData
): Promise<{ success: boolean; url: string | null; error: string | null }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, url: null, error: "Not authenticated" };
    }

    const file = formData.get("file") as File | null;
    const childId = formData.get("childId") as string | null;

    console.log("[uploadImage] file:", file?.name, "size:", file?.size, "childId:", childId);

    if (!file || !childId) {
      console.log("[uploadImage] MISSING file or childId");
      return { success: false, url: null, error: "Missing file or childId" };
    }

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${childId}/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from("development-images")
      .upload(path, buffer, {
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("[uploadImage] ERROR:", uploadError);
      return { success: false, url: null, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("development-images").getPublicUrl(path);

    console.log("[uploadImage] SUCCESS url:", publicUrl);
    return { success: true, url: publicUrl, error: null };
  } catch (err) {
    console.error("uploadImage unexpected error:", err);
    return { success: false, url: null, error: "Upload failed" };
  }
}
