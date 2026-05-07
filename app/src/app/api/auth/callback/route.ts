import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/lib/auth/types";

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  nanny: "/nanny",
  parent: "/parent",
  admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

/**
 * Mirror auth.users.email → user_profiles.email when the two have
 * diverged. Called after every successful code exchange so we don't
 * have to discriminate between event types — if the rows agree the
 * UPDATE is a no-op.
 *
 * This is the SERVER-SIDE leg of the email-change sync. The
 * preferred enforcement layer is a DB trigger on auth.users
 * (supabase/migrations/sync-user-profile-email.sql) — when that's
 * installed, it fires inside the same transaction as the gotrue
 * UPDATE and this function becomes pure defence-in-depth. When the
 * managed project rejects the trigger install (postgres role is
 * not the owner of auth.users), this is the load-bearing path.
 *
 * Uses the service-role admin client so the UPDATE bypasses RLS
 * cleanly. The userId + email values come from the just-confirmed
 * session, never from request input — so there's no spoofing
 * surface.
 */
async function syncUserProfileEmailIfNeeded(
  userId: string,
  authEmail: string | undefined,
): Promise<void> {
  if (!authEmail) return;
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("user_profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return;
    if (profile.email === authEmail) return;
    await admin
      .from("user_profiles")
      .update({ email: authEmail, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (err) {
    // Non-fatal — auth-level email is already committed; the worst
    // case is the UI shows the old user_profiles.email until the
    // next sync attempt. Log so it's findable in production logs.
    console.error("[auth/callback] user_profiles.email sync failed:", err);
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const origin = requestUrl.origin;

  if (code) {
    const supabase = createClient();

    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Resolve the (now-updated) user. For email-change
      // confirmations this is the moment auth.users has the new
      // email but user_profiles may still hold the old one — sync
      // before we redirect so the destination page reads the new
      // value immediately.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await syncUserProfileEmailIfNeeded(user.id, user.email);
      }

      // If a specific redirect was requested (e.g. password reset,
      // email-change), go there.
      if (next) {
        return NextResponse.redirect(new URL(next, origin));
      }

      // Otherwise, redirect to the user's dashboard
      if (user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .single();

        if (roleData?.role) {
          const dashboardPath = ROLE_DASHBOARDS[roleData.role as UserRole];
          return NextResponse.redirect(new URL(dashboardPath, origin));
        } else {
          return NextResponse.redirect(new URL("/signup", origin));
        }
      }
    }
  }

  // Error or no code - redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}
