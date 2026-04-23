"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Milestone } from "@/types/bapp";

export async function getMilestones(): Promise<{
  success: boolean;
  error: string | null;
  data: Milestone[];
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bapp_milestones")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("getMilestones error:", error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, error: null, data: (data as Milestone[]) ?? [] };
  } catch (err) {
    console.error("getMilestones unexpected error:", err);
    return { success: false, error: "Failed to fetch milestones", data: [] };
  }
}
