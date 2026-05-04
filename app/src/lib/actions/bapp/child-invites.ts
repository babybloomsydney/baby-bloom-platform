"use server";

/**
 * Child invite linking — server actions.
 *
 * Implements the redesign from system/APP/Nanny:Parent\ child\ linking/
 * (canonical spec: 02-design.md; this file maps to 04-server-actions.md
 * sections 3-10).
 *
 * Module boundary: ALL invite-related logic lives here. Other code
 * consumes via the typed envelope contract — never reaches inside.
 *
 * Kill switch: every invite-creation entry point checks
 * INVITE_LINKS_ENABLED. When 'false', actions early-return with
 * 'invites_disabled' (audit fix C11).
 *
 * Atomic transactions go through SECURITY DEFINER PG functions
 * (connect_child_invite, ensure_placement, get_invite_preview,
 * get_pending_invites_for_recipient) installed in the migration.
 * Direct UPDATEs to child_client.parent_user_id / nanny_user_id are
 * forbidden in app code — that invariant is enforced via review per
 * 04 §8 and 06 §8.
 */

import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import type {
  ChildInviteDirection,
  ChildInvitePreview,
  PendingInviteCard,
} from "@/types/bapp";

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Generates a 24-char URL-safe random token.
 * `randomBytes(18)` → 18 bytes → base64url is 24 chars (no padding).
 */
function generateToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

/** Builds the public invite URL. Default origin per audit fix C13. */
function buildInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_INVITE_BASE_URL ?? "https://babybloomsydney.com.au";
  return `${base}/invite/${token}`;
}

/**
 * Single source of truth for the kill switch read pattern. Exported so
 * sibling modules (child-clients.ts, auth/actions.ts) reuse the exact
 * same predicate — avoids drift if the env shape ever changes.
 */
export function invitesDisabled(): boolean {
  return process.env.INVITE_LINKS_ENABLED === "false";
}

/**
 * Validates token format BEFORE any DB call. Defence-in-depth rate
 * limiter: malformed tokens never reach Postgres. base64url alphabet
 * is `[A-Za-z0-9_-]`; we accept lengths 20–32 to allow for future
 * format experiments without blocking valid tokens.
 */
function isValidTokenFormat(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,32}$/.test(token);
}

// ── 3. mintChildInvite (internal helper) ───────────────────────────────
//
// Not exported as a public action — called by createChild,
// createChildAsParent, and regenerateChildInvite. Throws on failure
// (the caller wraps and translates to error envelope).

interface MintInviteParams {
  childId: string;
  direction: ChildInviteDirection;
  userId: string;
  userEmail: string;
  /** Optional: carry over recipient_user_id from a revoked invite (regenerate flow). */
  recipientUserId?: string | null;
}

export async function mintChildInvite(
  params: MintInviteParams,
): Promise<{ token: string; url: string }> {
  const admin = createAdminClient();
  const token = generateToken();

  const { error } = await admin.from("child_invites").insert({
    child_client_id: params.childId,
    token,
    created_by_user_id: params.userId,
    created_by_email_at_creation: params.userEmail,
    direction: params.direction,
    status: "pending",
    recipient_user_id: params.recipientUserId ?? null,
  });

  if (error) {
    console.error("mintChildInvite insert error:", error);
    // The unique-pending-per-child-direction index would fire if a
    // pending invite already exists. That's a caller bug — they
    // should revoke first. We surface as a thrown error for the
    // caller's catch block.
    throw new Error(`mint_failed: ${error.message}`);
  }

  return { token, url: buildInviteUrl(token) };
}

// ── 4. regenerateChildInvite ───────────────────────────────────────────

export async function regenerateChildInvite(childId: string): Promise<{
  success: boolean;
  error: string | null;
  data: { token: string; url: string } | null;
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
      return { success: false, error: "not_authenticated", data: null };
    }

    const admin = createAdminClient();

    // 1. Capture the current pending invite (direction + recipient_user_id).
    const { data: current, error: selectError } = await admin
      .from("child_invites")
      .select("direction, recipient_user_id, created_by_user_id")
      .eq("child_client_id", childId)
      .eq("status", "pending")
      .maybeSingle();

    if (selectError) {
      console.error("regenerateChildInvite select error:", selectError);
      return { success: false, error: selectError.message, data: null };
    }
    if (!current) {
      return { success: false, error: "no_pending_invite", data: null };
    }

    // 2. Authorise: only the creator can regenerate.
    if (current.created_by_user_id !== user.id) {
      return { success: false, error: "not_creator", data: null };
    }

    // 3. Revoke the current invite.
    const { error: revokeError } = await admin
      .from("child_invites")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_reason: "regenerated",
      })
      .eq("child_client_id", childId)
      .eq("status", "pending");

    if (revokeError) {
      console.error("regenerateChildInvite revoke error:", revokeError);
      return { success: false, error: revokeError.message, data: null };
    }

    // 4. Mint the new invite, carrying over recipient_user_id so the
    //    pending-card on the recipient's dashboard auto-shifts to the
    //    new token (06 §1.7 race handling).
    const { token, url } = await mintChildInvite({
      childId,
      direction: current.direction as ChildInviteDirection,
      userId: user.id,
      userEmail: user.email ?? "",
      recipientUserId: current.recipient_user_id,
    });

    // 5. Audit log.
    await admin.from("activity_logs").insert({
      action_type: "invite_regenerated",
      user_id: user.id,
      action_details: {
        child_id: childId,
        had_recipient: current.recipient_user_id !== null,
      },
    });

    revalidateTag("pending-invites");

    return { success: true, error: null, data: { token, url } };
  } catch (err) {
    console.error("regenerateChildInvite unexpected error:", err);
    return {
      success: false,
      error: "Failed to regenerate invite",
      data: null,
    };
  }
}

// ── 5. revokeChildInvite ───────────────────────────────────────────────

export async function revokeChildInvite(childId: string): Promise<{
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
      return { success: false, error: "not_authenticated" };
    }

    const admin = createAdminClient();

    // Authorise: only the creator can revoke.
    const { data: current } = await admin
      .from("child_invites")
      .select("created_by_user_id")
      .eq("child_client_id", childId)
      .eq("status", "pending")
      .maybeSingle();
    if (!current) {
      return { success: false, error: "no_pending_invite" };
    }
    if (current.created_by_user_id !== user.id) {
      return { success: false, error: "not_creator" };
    }

    const { error: revokeError } = await admin
      .from("child_invites")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_reason: "manual",
      })
      .eq("child_client_id", childId)
      .eq("status", "pending");

    if (revokeError) {
      console.error("revokeChildInvite error:", revokeError);
      return { success: false, error: revokeError.message };
    }

    await admin.from("activity_logs").insert({
      action_type: "invite_revoked",
      user_id: user.id,
      action_details: { child_id: childId, reason: "manual" },
    });

    revalidateTag("pending-invites");

    return { success: true, error: null };
  } catch (err) {
    console.error("revokeChildInvite unexpected error:", err);
    return { success: false, error: "Failed to revoke invite" };
  }
}

// ── 6. getInvitePreview (public — anonymous-safe) ──────────────────────

export async function getInvitePreview(token: string): Promise<{
  success: boolean;
  error: string | null;
  data: ChildInvitePreview | null;
}> {
  // Token-format pre-check: defence-in-depth rate limiter.
  if (!isValidTokenFormat(token)) {
    return { success: false, error: "invite_not_found", data: null };
  }

  try {
    // Use the user-scoped client so the JWT (or absence) flows into the
    // SECURITY DEFINER function's auth.uid() check. The function itself
    // gates redaction on auth.uid() IS NOT NULL.
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_invite_preview", {
      invite_token: token,
    });

    if (error) {
      console.error("getInvitePreview rpc error:", error);
      return { success: false, error: "transaction_failed", data: null };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "invite_not_found", data: null };
    }

    const row = data[0] as {
      status: string;
      direction: string;
      child_first_name: string;
      inviter_display: string;
    };

    return {
      success: true,
      error: null,
      data: {
        status: row.status as ChildInvitePreview["status"],
        direction: row.direction as ChildInviteDirection,
        childFirstName: row.child_first_name,
        inviterDisplay: row.inviter_display,
      },
    };
  } catch (err) {
    console.error("getInvitePreview unexpected error:", err);
    return { success: false, error: "transaction_failed", data: null };
  }
}

// ── 7. signupViaInvite (called server-side from inside signUp) ─────────

/**
 * Stamps recipient_user_id on the invite row after a freshly-signed-up
 * user has been created in auth.users. Must be called from inside the
 * signUp server action (NOT from the browser) using the admin client,
 * because the user's session may not be fully established at that
 * moment depending on the email-confirm setting.
 *
 * Tracking field only — does NOT create the link / placement. The user
 * still needs to tap Connect on the landing page to claim the invite.
 */
export async function signupViaInvite(params: {
  token: string;
  userId: string;
}): Promise<{ success: boolean; error: string | null }> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled" };
  }
  if (!isValidTokenFormat(params.token)) {
    return { success: false, error: "invite_not_found" };
  }

  try {
    const admin = createAdminClient();
    // Race guard: only stamp if the slot is still empty. Two concurrent
    // signups via the same shared token resolve in arrival order — the
    // second writer no-ops rather than silently overwriting the first.
    // The PG `connect_child_invite` function still gates the actual claim,
    // so this is purely about which user's pending-invite card surfaces.
    const { error } = await admin
      .from("child_invites")
      .update({ recipient_user_id: params.userId })
      .eq("token", params.token)
      .eq("status", "pending")
      .is("recipient_user_id", null);

    if (error) {
      console.error("signupViaInvite update error:", error);
      return { success: false, error: error.message };
    }

    // Audit log — token is hashed for cross-reference without leaking.
    const tokenHash = crypto
      .createHash("sha256")
      .update(params.token)
      .digest("hex")
      .slice(0, 16);
    await admin.from("activity_logs").insert({
      action_type: "signup_via_invite",
      user_id: params.userId,
      action_details: { token_hash: tokenHash },
    });

    revalidateTag("pending-invites");

    return { success: true, error: null };
  } catch (err) {
    console.error("signupViaInvite unexpected error:", err);
    return { success: false, error: "Failed to record signup-via-invite" };
  }
}

// ── 8. connectChildInvite (the atomic claim transaction) ───────────────

/**
 * The most security-critical action in the file. All DB writes happen
 * inside the SECURITY DEFINER PG function `connect_child_invite()`.
 * This wrapper authenticates the caller, calls the RPC with the
 * caller's user_id as an explicit parameter, and translates RAISE
 * EXCEPTION error codes into the action's error envelope.
 *
 * Stable error codes (per 03-schema-migration.md):
 *   P0001 invite_not_found         P0005 role_mismatch
 *   P0002 invite_already_connected P0006 child_not_found
 *   P0003 invite_revoked           P0007 role_table_missing
 *   P0004 no_role
 */
const CONNECT_ERROR_MAP: Record<string, string> = {
  P0001: "invite_not_found",
  P0002: "invite_already_connected",
  P0003: "invite_revoked",
  P0004: "no_role",
  P0005: "role_mismatch",
  P0006: "child_not_found",
  P0007: "role_table_missing",
};

export async function connectChildInvite(token: string): Promise<{
  success: boolean;
  error: string | null;
  data: { childId: string } | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled", data: null };
  }
  if (!isValidTokenFormat(token)) {
    return { success: false, error: "invite_not_found", data: null };
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "not_authenticated", data: null };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("connect_child_invite", {
      p_token: token,
      p_caller_user: user.id,
    });

    if (error) {
      const envelope = CONNECT_ERROR_MAP[error.code] ?? "transaction_failed";
      console.error("connectChildInvite rpc error:", {
        code: error.code,
        envelope,
      });
      return { success: false, error: envelope, data: null };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "transaction_failed", data: null };
    }

    const row = data[0] as { child_id: string };
    revalidatePath("/parent");
    revalidatePath("/nanny");
    revalidateTag("pending-invites");

    return { success: true, error: null, data: { childId: row.child_id } };
  } catch (err) {
    console.error("connectChildInvite unexpected error:", err);
    return { success: false, error: "transaction_failed", data: null };
  }
}

// ── 9. declineChildInvite ──────────────────────────────────────────────

/**
 * Clears recipient_user_id but leaves the invite alive at status='pending'.
 * Per design, the same parent (or someone else) can come back later and
 * claim the same token. No DB writes to child_client / nanny_placements.
 */
export async function declineChildInvite(token: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  if (invitesDisabled()) {
    return { success: false, error: "invites_disabled" };
  }
  if (!isValidTokenFormat(token)) {
    return { success: false, error: "invite_not_found" };
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "not_authenticated" };
    }

    const admin = createAdminClient();
    // Capture child_id before clearing recipient_user_id (audit metadata).
    const { data: current } = await admin
      .from("child_invites")
      .select("child_client_id, recipient_user_id")
      .eq("token", token)
      .eq("status", "pending")
      .maybeSingle();
    if (!current) {
      return { success: false, error: "invite_not_found" };
    }
    if (current.recipient_user_id !== user.id) {
      // Decline is scoped to the user the invite was stamped to.
      return { success: false, error: "not_recipient" };
    }

    const { error: updateError } = await admin
      .from("child_invites")
      .update({ recipient_user_id: null })
      .eq("token", token)
      .eq("status", "pending");

    if (updateError) {
      console.error("declineChildInvite update error:", updateError);
      return { success: false, error: updateError.message };
    }

    await admin.from("activity_logs").insert({
      action_type: "invite_declined",
      user_id: user.id,
      action_details: { child_id: current.child_client_id },
    });

    revalidatePath("/parent");
    revalidatePath("/nanny");
    revalidateTag("pending-invites");

    return { success: true, error: null };
  } catch (err) {
    console.error("declineChildInvite unexpected error:", err);
    return { success: false, error: "Failed to decline invite" };
  }
}

// ── 10. getPendingInvitesForUser ───────────────────────────────────────

export async function getPendingInvitesForUser(): Promise<{
  success: boolean;
  error: string | null;
  data: PendingInviteCard[];
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "not_authenticated", data: [] };
    }

    // The SECURITY DEFINER function scopes by auth.uid() internally and
    // never returns the token column. We use the user-scoped client so
    // auth.uid() inside the function resolves to this user (admin client
    // would see auth.uid() = NULL).
    const { data, error } = await supabase.rpc(
      "get_pending_invites_for_recipient",
    );

    if (error) {
      console.error("getPendingInvitesForUser rpc error:", error);
      return { success: false, error: error.message, data: [] };
    }

    const cards: PendingInviteCard[] = (data ?? []).map(
      (row: {
        id: string;
        child_client_id: string;
        direction: string;
        child_first_name: string;
        inviter_first_name: string | null;
        created_at: string;
      }) => ({
        inviteId: row.id,
        childClientId: row.child_client_id,
        direction: row.direction as ChildInviteDirection,
        childFirstName: row.child_first_name,
        inviterFirstName: row.inviter_first_name ?? "",
        createdAt: row.created_at,
      }),
    );

    return { success: true, error: null, data: cards };
  } catch (err) {
    console.error("getPendingInvitesForUser unexpected error:", err);
    return {
      success: false,
      error: "Failed to load pending invites",
      data: [],
    };
  }
}
