"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import type { ChildClient, ChildClientEvents } from "@/types/bapp";
import { mintChildInvite } from "./child-invites";
import { invitesDisabled } from "@/lib/invite/flags";
import { recordConsent } from "@/lib/legal/record-consent";

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
      admin.from("child_client").select("*").eq("id", childId).maybeSingle(),
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

    // Ownership gate — admin client bypasses RLS, so we authorise here.
    // The caller must be either the linked parent or the linked nanny.
    const child = childRes.data as ChildClient | null;
    if (!child) {
      return { success: false, error: "child_not_found", data: null };
    }
    if (child.parent_user_id !== user.id && child.nanny_user_id !== user.id) {
      return { success: false, error: "not_linked_to_child", data: null };
    }

    return {
      success: true,
      error: null,
      data: {
        child,
        events: (eventsRes.data as ChildClientEvents) ?? null,
      },
    };
  } catch (err) {
    console.error("getChildDetail unexpected error:", err);
    return {
      success: false,
      error: "Failed to fetch child details",
      data: null,
    };
  }
}

// ── createChild (revised — invite-link redesign 2026-05-04) ──────────
//
// Path A: nanny creates a child, gets an invite token to share with the
// parent. The parent_lead_email field + the "parent already on Baby
// Bloom" lookup were removed — replaced by the invite-link flow which
// handles the same idempotency at claim time via connect_child_invite().
//
// Disclaimer (AGR-14) is required: the nanny must confirm guardian
// permission. Recorded via recordConsent for compliance audit.

export async function createChild(data: {
  first_name: string;
  date_of_birth: string;
  gender: string | null;
  guardian_permission_confirmed: boolean;
}): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string; inviteToken: string; inviteUrl: string } | null;
}> {
  // Kill switch — feature gate per audit fix C11.
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled", data: null };
  }

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

    // 1. Verify caller is a nanny.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "nanny") {
      return { success: false, error: "role_mismatch", data: null };
    }

    // 2. Validate disclaimer + required fields.
    if (data.guardian_permission_confirmed !== true) {
      return {
        success: false,
        error: "You must confirm guardian permission to add this child.",
        data: null,
      };
    }
    if (!data.first_name?.trim() || !data.date_of_birth?.trim()) {
      return { success: false, error: "missing_required_fields", data: null };
    }

    // 3. Insert child_client. parent_lead_email left NULL — invite flow
    //    handles the contact path now.
    const { data: child, error: insertError } = await admin
      .from("child_client")
      .insert({
        nanny_user_id: user.id,
        parent_user_id: null,
        parent_lead_email: null,
        first_name: data.first_name.trim(),
        date_of_birth: data.date_of_birth,
        gender: data.gender,
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

    // 4. Insert child_client_events.
    await admin.from("child_client_events").insert({
      child_client_id: child.id,
      created_manual_at: new Date().toISOString(),
    });

    // 5. Record consent (AGR-14). Acceptable risk: if this fails after
    //    the child is inserted, we have a child without consent. The
    //    activity_logs entry below preserves the audit trail and a
    //    remediation script can backfill if needed (per spec 04 §1).
    await recordConsent(
      [
        {
          agreementId: "AGR-14",
          checkpointId: "agr14_guardian_permission",
          checkpointText:
            "I confirm I have the child's legal guardian's permission to add this child to Baby Bloom.",
        },
      ],
      child.id,
    );

    // 6. Mint the invite. Wrapped in try/catch so insert + consent are
    //    preserved if mint fails — but mint failure is rare and the
    //    nanny can retry via the regenerate flow.
    let mintResult: { token: string; url: string };
    try {
      mintResult = await mintChildInvite({
        childId: child.id,
        direction: "nanny_to_parent",
        userId: user.id,
        userEmail: user.email ?? "",
      });
    } catch (mintErr) {
      console.error("createChild mint error:", mintErr);
      return {
        success: false,
        error: "Child created but invite mint failed — try regenerating.",
        data: null,
      };
    }

    // 7. Audit log.
    await admin.from("activity_logs").insert({
      action_type: "invite_created",
      user_id: user.id,
      action_details: {
        child_id: child.id,
        direction: "nanny_to_parent",
      },
    });

    revalidatePath("/nanny");
    revalidateTag("pending-invites");

    return {
      success: true,
      error: null,
      data: {
        id: child.id,
        inviteToken: mintResult.token,
        inviteUrl: mintResult.url,
      },
    };
  } catch (err) {
    console.error("createChild unexpected error:", err);
    return { success: false, error: "Failed to create child", data: null };
  }
}

// ── createChildAsParent (Path B) ─────────────────────────────────────
//
// Parent-first child creation. Identical shape to createChild minus the
// disclaimer (parent IS the legal guardian). Sets parent_user_id +
// leaves nanny_user_id NULL, opposite of Path A.

export async function createChildAsParent(data: {
  first_name: string;
  date_of_birth: string;
  gender: string | null;
}): Promise<{
  success: boolean;
  error: string | null;
  data: { id: string; inviteToken: string; inviteUrl: string } | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled", data: null };
  }

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

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "parent") {
      return { success: false, error: "role_mismatch", data: null };
    }

    if (!data.first_name?.trim() || !data.date_of_birth?.trim()) {
      return { success: false, error: "missing_required_fields", data: null };
    }

    const { data: child, error: insertError } = await admin
      .from("child_client")
      .insert({
        nanny_user_id: null,
        parent_user_id: user.id,
        first_name: data.first_name.trim(),
        date_of_birth: data.date_of_birth,
        gender: data.gender,
        onboarded: true,
        under_three: true,
        status: "created_manual",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("createChildAsParent insert error:", insertError);
      return { success: false, error: insertError.message, data: null };
    }

    await admin.from("child_client_events").insert({
      child_client_id: child.id,
      created_manual_at: new Date().toISOString(),
    });

    let mintResult: { token: string; url: string };
    try {
      mintResult = await mintChildInvite({
        childId: child.id,
        direction: "parent_to_nanny",
        userId: user.id,
        userEmail: user.email ?? "",
      });
    } catch (mintErr) {
      console.error("createChildAsParent mint error:", mintErr);
      return {
        success: false,
        error: "Child created but invite mint failed — try regenerating.",
        data: null,
      };
    }

    await admin.from("activity_logs").insert({
      action_type: "invite_created",
      user_id: user.id,
      action_details: {
        child_id: child.id,
        direction: "parent_to_nanny",
      },
    });

    revalidatePath("/parent");
    revalidateTag("pending-invites");

    return {
      success: true,
      error: null,
      data: {
        id: child.id,
        inviteToken: mintResult.token,
        inviteUrl: mintResult.url,
      },
    };
  } catch (err) {
    console.error("createChildAsParent unexpected error:", err);
    return { success: false, error: "Failed to create child", data: null };
  }
}

// ── onboardChild (legacy, unchanged) ─────────────────────────────────

export async function onboardChild(
  childId: string,
  data: {
    first_name: string;
    date_of_birth: string;
    gender?: string | null;
  },
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

    // Ownership gate — admin client bypasses RLS. Only the linked nanny
    // or parent for this child can edit profile fields.
    const { data: existing } = await admin
      .from("child_client")
      .select("nanny_user_id, parent_user_id")
      .eq("id", childId)
      .maybeSingle();
    if (!existing) {
      return { success: false, error: "child_not_found" };
    }
    if (
      existing.nanny_user_id !== user.id &&
      existing.parent_user_id !== user.id
    ) {
      return { success: false, error: "not_linked_to_child" };
    }

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

// ── deleteChild placement-end helper (JS, intentional scope limit) ──
//
// `removeNannyFromChild` and `nannyLeaveChild` were migrated to
// SECURITY DEFINER PG functions in M1 because the spec forbids direct
// UPDATEs to `child_client.nanny_user_id` from app code. `deleteChild`
// is different: it issues a DELETE (not an UPDATE on link columns),
// which is itself atomic. The placement-end + per-side current_*
// fixup that follows the DELETE is acceptable in app code — it
// touches `nanny_placements` and the role tables, not the forbidden
// link columns. If a future review escalates this to forbidden, we
// add a `delete_child_atomic` SECURITY DEFINER function and switch.

async function endPlacementForDeletedChild(
  admin: ReturnType<typeof createAdminClient>,
  parentUserId: string,
  formerNannyUserId: string,
): Promise<{ ended: boolean; error: string | null }> {
  const { count, error: countError } = await admin
    .from("child_client")
    .select("id", { count: "exact", head: true })
    .eq("parent_user_id", parentUserId)
    .eq("nanny_user_id", formerNannyUserId);
  if (countError) return { ended: false, error: countError.message };
  if ((count ?? 0) > 0) return { ended: false, error: null };

  const [{ data: nannyRow }, { data: parentRow }] = await Promise.all([
    admin
      .from("nannies")
      .select("id")
      .eq("user_id", formerNannyUserId)
      .maybeSingle(),
    admin
      .from("parents")
      .select("id")
      .eq("user_id", parentUserId)
      .maybeSingle(),
  ]);
  if (!nannyRow || !parentRow) return { ended: false, error: null };

  const { error: endError } = await admin
    .from("nanny_placements")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      end_reason: "other",
      end_notes: "Removed via BB-app child delete",
    })
    .eq("nanny_id", nannyRow.id)
    .eq("parent_id", parentRow.id)
    .eq("status", "active");
  if (endError) return { ended: false, error: endError.message };

  const { count: nannyOtherActive } = await admin
    .from("nanny_placements")
    .select("id", { count: "exact", head: true })
    .eq("nanny_id", nannyRow.id)
    .eq("status", "active");
  if ((nannyOtherActive ?? 0) === 0) {
    await admin
      .from("nannies")
      .update({ current_placement_id: null })
      .eq("id", nannyRow.id);
  }

  const { count: parentOtherActive } = await admin
    .from("nanny_placements")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", parentRow.id)
    .eq("status", "active");
  if ((parentOtherActive ?? 0) === 0) {
    await admin
      .from("parents")
      .update({ current_placement_id: null, current_nanny_id: null })
      .eq("id", parentRow.id);
  }

  return { ended: true, error: null };
}

// ── SQLSTATE → error envelope mapping for the unlink RPCs ───────────
//
// Mirrors CONNECT_ERROR_MAP in child-invites.ts. Codes are stable
// (defined in migration/04-unlink-functions.sql).

const UNLINK_ERROR_MAP: Record<string, string> = {
  P0006: "child_not_found",
  P0008: "not_parent",
  P0009: "not_nanny",
};

// ── removeNannyFromChild (parent-initiated) ─────────────────────────
//
// Atomic via SECURITY DEFINER PG function `remove_nanny_from_child`.
// Closes M19 (Phase 2 deferred HIGH): app code no longer issues a
// direct UPDATE to `child_client.nanny_user_id`. The PG function
// holds `FOR UPDATE` on the child row through the entire sever +
// placement-end + per-side current_* fixup + activity-log INSERT.

export async function removeNannyFromChild(childId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled" };
  }

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
    const { error } = await admin.rpc("remove_nanny_from_child", {
      p_child_id: childId,
      p_caller_user: user.id,
    });

    if (error) {
      const envelope = UNLINK_ERROR_MAP[error.code] ?? "transaction_failed";
      console.error("removeNannyFromChild rpc error:", {
        code: error.code,
        envelope,
      });
      return { success: false, error: envelope };
    }

    revalidatePath("/parent");
    return { success: true, error: null };
  } catch (err) {
    console.error("removeNannyFromChild unexpected error:", err);
    return { success: false, error: "Failed to remove nanny" };
  }
}

// ── nannyLeaveChild (nanny-initiated self-removal) ──────────────────
//
// Atomic via `nanny_leave_child` PG function. Sets `orphaned_at` when
// no parent linked (orphan limbo); pending invite is NOT revoked per
// spec 06 §3.4 — token stays alive so a future parent can still claim.

export async function nannyLeaveChild(childId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled" };
  }

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
    const { error } = await admin.rpc("nanny_leave_child", {
      p_child_id: childId,
      p_caller_user: user.id,
    });

    if (error) {
      const envelope = UNLINK_ERROR_MAP[error.code] ?? "transaction_failed";
      console.error("nannyLeaveChild rpc error:", {
        code: error.code,
        envelope,
      });
      return { success: false, error: envelope };
    }

    revalidatePath("/nanny");
    return { success: true, error: null };
  } catch (err) {
    console.error("nannyLeaveChild unexpected error:", err);
    return { success: false, error: "Failed to leave child" };
  }
}

// ── deleteChild (parent-only hard delete) ───────────────────────────

export async function deleteChild(childId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled" };
  }

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

    // 1. Load child + verify caller is the parent. Capture nanny for placement-end.
    const { data: child, error: loadError } = await admin
      .from("child_client")
      .select("id, parent_user_id, nanny_user_id")
      .eq("id", childId)
      .maybeSingle();
    if (loadError || !child) {
      return { success: false, error: "child_not_found" };
    }
    if (child.parent_user_id !== user.id) {
      return { success: false, error: "not_parent" };
    }
    const nannyUserIdAtDelete = child.nanny_user_id;
    const hadActivePlacement = nannyUserIdAtDelete !== null;

    // 2. Hard delete. Cascades to child_client_events, bapp_logs,
    //    bapp_progress_*, child_invites (per FK ON DELETE CASCADE).
    const { error: deleteError } = await admin
      .from("child_client")
      .delete()
      .eq("id", childId);
    if (deleteError) {
      console.error("deleteChild delete error:", deleteError);
      return { success: false, error: deleteError.message };
    }

    // 3. End placement conditionally if a nanny was attached.
    if (nannyUserIdAtDelete) {
      const placementResult = await endPlacementForDeletedChild(
        admin,
        user.id,
        nannyUserIdAtDelete,
      );
      if (placementResult.error) {
        console.error(
          "deleteChild placement-end error:",
          placementResult.error,
        );
      }
    }

    await admin.from("activity_logs").insert({
      action_type: "child_deleted",
      user_id: user.id,
      action_details: {
        child_id: childId,
        had_active_placement: hadActivePlacement,
      },
    });

    revalidatePath("/parent");
    return { success: true, error: null };
  } catch (err) {
    console.error("deleteChild unexpected error:", err);
    return { success: false, error: "Failed to delete child" };
  }
}
