"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/** Transition child to active_nanny on first action */
async function maybeActivateChild(childId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: child } = await admin
    .from("child_client")
    .select("status")
    .eq("id", childId)
    .single();

  if (
    child &&
    (child.status === "setup" || child.status === "created_manual")
  ) {
    await admin
      .from("child_client")
      .update({ status: "active_nanny" })
      .eq("id", childId);

    await admin
      .from("child_client_events")
      .update({ active_nanny_at: new Date().toISOString() })
      .eq("child_client_id", childId);
  }
}

export async function logDiaryEntry(
  childId: string,
  data: Record<string, unknown>
): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const admin = createAdminClient();

    const { error: insertError } = await admin.from("bapp_logs").insert({
      child_client_id: childId,
      author_id: user.id,
      type: "diary",
      status: "completed",
      context: "adhoc",
      data,
    });

    if (insertError) {
      console.error("logDiaryEntry insert error:", insertError);
      return { success: false, error: insertError.message };
    }

    await maybeActivateChild(childId);

    revalidatePath(`/nanny/development/${childId}`);
    revalidatePath(`/parent/development/${childId}`);
    return { success: true, error: null };
  } catch (err) {
    console.error("logDiaryEntry unexpected error:", err);
    return { success: false, error: "Failed to log diary entry" };
  }
}
