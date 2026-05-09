"use server";

/**
 * Admin-only: flip the `user_profiles.is_test_user` flag.
 *
 * Test users get unconditional access to paid features (every Stripe
 * call is skipped, every commission flow no-ops if either party in
 * a pair is flagged). Used for QA, demos, internal accounts.
 *
 * Spec: `system/APP/PAYMENTS/02-business-model.md §11` +
 * `system/APP/PAYMENTS/09-server-actions.md` (action signature) +
 * `system/APP/PAYMENTS/15-admin-management.md §14` (admin role gate).
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ActionResult {
  success: boolean;
  error: string | null;
}

async function requireAdmin(): Promise<{
  userId: string;
  error: string | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { userId: "", error: "Not authenticated" };

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single<{ role: string }>();

  if (!role || !["admin", "super_admin"].includes(role.role)) {
    return { userId: "", error: "Not authorized — admin role required" };
  }
  return { userId: user.id, error: null };
}

/**
 * Flips `user_profiles.is_test_user` for the target user. Records the
 * change to `activity_logs` with the supplied reason for audit. Idempotent
 * — flipping to the current value is a no-op (returns success without
 * a duplicate log entry).
 */
export async function setTestUserFlag(
  userId: string,
  flag: boolean,
  reason: string,
): Promise<ActionResult> {
  if (!userId) {
    return { success: false, error: "userId is required" };
  }
  if (!reason || reason.trim().length < 3) {
    return {
      success: false,
      error: "A short reason is required for the audit log.",
    };
  }

  const { userId: adminId, error: authErr } = await requireAdmin();
  if (authErr) return { success: false, error: authErr };

  const admin = createAdminClient();

  // Read current state — skip the write if no change.
  const { data: current, error: readErr } = await admin
    .from("user_profiles")
    .select("is_test_user")
    .eq("user_id", userId)
    .maybeSingle<{ is_test_user: boolean | null }>();

  if (readErr) {
    return { success: false, error: `Read failed: ${readErr.message}` };
  }
  if (!current) {
    return { success: false, error: "User profile not found" };
  }
  if ((current.is_test_user ?? false) === flag) {
    return { success: true, error: null };
  }

  const { error: updateErr } = await admin
    .from("user_profiles")
    .update({ is_test_user: flag })
    .eq("user_id", userId);

  if (updateErr) {
    return { success: false, error: `Update failed: ${updateErr.message}` };
  }

  // Audit log — non-fatal if it fails (the flip itself succeeded).
  await admin.from("activity_logs").insert({
    user_id: adminId,
    action_type: "test_user_flag_changed",
    action_details: {
      target_user_id: userId,
      previous_value: current.is_test_user ?? false,
      new_value: flag,
      reason: reason.trim(),
    },
  });

  return { success: true, error: null };
}
