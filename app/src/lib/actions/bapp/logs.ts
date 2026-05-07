"use server";

/**
 * User-facing CRUD on `bapp_logs` rows beyond initial creation.
 *
 * Currently exposes a single soft-delete entry point; edit may
 * arrive later (the user accepted delete-only as the v1 floor).
 *
 * Design notes:
 *
 *   - **Soft delete only.** The `is_active` column was added by
 *     `katie-foundation.sql` and every feed query already filters
 *     `is_active = true`, so flipping the flag removes the row from
 *     the user's feed without losing the row itself. This preserves
 *     audit history (who created what), keeps Katie's memory /
 *     context-builder able to reference the original event, and
 *     gives us an obvious "undelete" path if the user changes their
 *     mind.
 *   - **Ownership gate** lives in this action, not RLS. The current
 *     RLS policy on `bapp_logs` (`user_crud`, `FOR ALL`) lets either
 *     party connected to the child mutate any row. That's fine for
 *     the soft-delete UX (parent can clean a nanny's miss-fire and
 *     vice versa) — confirming the caller has access to the child
 *     here is enough. We DO NOT additionally restrict to `author_id
 *     = caller`, on purpose: the hero is a shared family feed.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function softDeleteBAppLog(
  logId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Reject malformed ids before they reach Postgres so we don't
    // log a noisy "invalid input syntax for type uuid" error for
    // what is really a client bug or scan attempt.
    if (!UUID_REGEX.test(logId)) {
      return { success: false, error: "Log not found" };
    }

    // Resolve the log + its child link in a single admin read so we
    // can authorise the caller before issuing the update. Using the
    // admin client mirrors the established pattern in
    // `updateChildProfilePictureUrl` / `updateChildDetails`.
    const admin = createAdminClient();
    const { data: log, error: logErr } = await admin
      .from("bapp_logs")
      .select("id, child_client_id, is_active")
      .eq("id", logId)
      .maybeSingle();
    if (logErr || !log) {
      return { success: false, error: "Log not found" };
    }

    // SECURITY: ownership gate runs BEFORE the idempotency check.
    // The earlier order (idempotency → ownership) created an
    // information oracle: a caller who does NOT own the linked
    // child got `success: true` for any already-soft-deleted log
    // they happened to know the id of, while getting "Not
    // authorised" for active rows on someone else's child. This
    // ordering deliberately gives both branches the same "Log not
    // found"-equivalent surface to a stranger. (security-reviewer
    // 2026-05-07.)
    const { data: child, error: childErr } = await admin
      .from("child_client")
      .select("id, parent_user_id, nanny_user_id")
      .eq("id", log.child_client_id)
      .maybeSingle();
    if (childErr || !child) {
      return { success: false, error: "Child not found" };
    }
    const isParent = child.parent_user_id === user.id;
    const isNanny = child.nanny_user_id === user.id;
    if (!isParent && !isNanny) {
      return { success: false, error: "Not authorised for this log" };
    }

    // Idempotent: if the row is already soft-deleted, treat it as a
    // success rather than 500 — the user double-tapped the menu.
    // Now safe to short-circuit because we've confirmed ownership.
    if (log.is_active === false) {
      return { success: true, error: null };
    }

    // SECURITY: admin .update() bypasses RLS. The ownership check
    // above is the only enforcement.
    const { error: updateError } = await admin
      .from("bapp_logs")
      .update({ is_active: false })
      .eq("id", logId);
    if (updateError) {
      console.error("[softDeleteBAppLog] update error:", updateError);
      return { success: false, error: "Failed to delete log" };
    }

    revalidatePath(`/parent/development/${log.child_client_id}`);
    revalidatePath(`/nanny/development/${log.child_client_id}`);
    return { success: true, error: null };
  } catch (err) {
    console.error("softDeleteBAppLog unexpected error:", err);
    return { success: false, error: "Failed to delete log" };
  }
}
