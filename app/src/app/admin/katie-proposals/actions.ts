"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type ProposalStatus = "open" | "accepted" | "rejected" | "implemented";

export async function reviewProposal(
  id: string,
  status: ProposalStatus,
  reviewerNotes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Not authenticated." };
  }

  const admin = createAdminClient();

  // Admin-only gate.
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = roleRow?.role;
  if (role !== "admin" && role !== "super_admin") {
    return { ok: false, error: "Admin role required." };
  }

  const { error } = await admin
    .from("katie_proposals")
    .update({
      status,
      reviewer_notes: reviewerNotes?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/katie-proposals");
  return { ok: true };
}
