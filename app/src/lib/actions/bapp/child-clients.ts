"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ChildClient, ChildClientEvents } from "@/types/bapp";

export async function getChildrenForUser(): Promise<{
  success: boolean;
  error: string | null;
  data: ChildClient[];
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated", data: [] };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("child_client")
      .select("*")
      .or(`nanny_user_id.eq.${user.id},parent_user_id.eq.${user.id}`)
      .eq("under_three", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("getChildrenForUser error:", error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, error: null, data: (data as ChildClient[]) ?? [] };
  } catch (err) {
    console.error("getChildrenForUser unexpected error:", err);
    return { success: false, error: "Failed to fetch children", data: [] };
  }
}

export async function getChildDetail(childId: string): Promise<{
  success: boolean;
  error: string | null;
  data: { child: ChildClient; events: ChildClientEvents | null } | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated", data: null };
    }

    const admin = createAdminClient();
    const [childRes, eventsRes] = await Promise.all([
      admin.from("child_client").select("*").eq("id", childId).single(),
      admin
        .from("child_client_events")
        .select("*")
        .eq("child_client_id", childId)
        .maybeSingle(),
    ]);

    if (childRes.error) {
      console.error("getChildDetail error:", childRes.error);
      return { success: false, error: childRes.error.message, data: null };
    }

    return {
      success: true,
      error: null,
      data: {
        child: childRes.data as ChildClient,
        events: (eventsRes.data as ChildClientEvents) ?? null,
      },
    };
  } catch (err) {
    console.error("getChildDetail unexpected error:", err);
    return { success: false, error: "Failed to fetch child details", data: null };
  }
}

export async function createChild(data: {
  first_name: string;
  date_of_birth: string;
  gender: string | null;
  parent_lead_email: string;
}): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string } | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated", data: null };
    }

    const admin = createAdminClient();

    // Validate: check parent email doesn't have an active placement
    const { data: existingParent } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("email", data.parent_lead_email)
      .maybeSingle();

    if (existingParent) {
      const { data: activePlacement } = await admin
        .from("nanny_placements")
        .select("id")
        .eq("status", "active")
        .or(
          `nanny_id.in.(select id from nannies where user_id='${existingParent.user_id}'),parent_id.in.(select id from parents where user_id='${existingParent.user_id}')`
        )
        .maybeSingle();

      if (activePlacement) {
        return {
          success: false,
          error:
            "This parent is already on Baby Bloom. Ask them to add your child through their account.",
          data: null,
        };
      }
    }

    // Insert child_client
    const { data: child, error: insertError } = await admin
      .from("child_client")
      .insert({
        nanny_user_id: user.id,
        first_name: data.first_name,
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        parent_lead_email: data.parent_lead_email,
        onboarded: true,
        under_three: true,
        status: "created_manual",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("createChild insert error:", insertError);
      return { success: false, error: insertError.message, data: null };
    }

    // Insert child_client_events
    await admin.from("child_client_events").insert({
      child_client_id: child.id,
      created_manual_at: new Date().toISOString(),
    });

    revalidatePath("/nanny");
    return { success: true, error: null, data: { id: child.id } };
  } catch (err) {
    console.error("createChild unexpected error:", err);
    return { success: false, error: "Failed to create child", data: null };
  }
}

export async function onboardChild(
  childId: string,
  data: {
    first_name: string;
    date_of_birth: string;
    gender?: string | null;
  }
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

    // Update child_client
    const { error: updateError } = await admin
      .from("child_client")
      .update({
        first_name: data.first_name,
        date_of_birth: data.date_of_birth,
        gender: data.gender ?? null,
        onboarded: true,
        status: "setup",
      })
      .eq("id", childId);

    if (updateError) {
      console.error("onboardChild update error:", updateError);
      return { success: false, error: updateError.message };
    }

    // Update child_client_events
    await admin
      .from("child_client_events")
      .update({ setup_at: new Date().toISOString() })
      .eq("child_client_id", childId);

    revalidatePath("/nanny");
    return { success: true, error: null };
  } catch (err) {
    console.error("onboardChild unexpected error:", err);
    return { success: false, error: "Failed to onboard child" };
  }
}
