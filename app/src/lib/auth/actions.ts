"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { UserRole } from "./types";
import { getDashboardPath } from "./roles";
import { sendEmail } from "@/lib/email/resend";
import { capitalizeName } from "@/lib/utils";
import { signupViaInvite } from "@/lib/actions/bapp/child-invites";

const INVITE_TOKEN_REGEX = /^[A-HJKMN-Z2-9]{4}-[A-HJKMN-Z2-9]{4}$/;

type InviteDirection = "nanny_to_parent" | "parent_to_nanny";

interface InviteContext {
  token: string;
  direction: InviteDirection;
}

async function lookupValidInvite(
  token: string,
  expectedRole: UserRole,
): Promise<InviteContext | null> {
  if (!INVITE_TOKEN_REGEX.test(token)) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("child_invites")
    .select("direction, status")
    .eq("token", token)
    .maybeSingle();

  if (error || !data || data.status !== "pending") {
    return null;
  }

  const direction = data.direction as InviteDirection;
  // Direction encodes who created it; recipient is the opposite role.
  const expectedRecipientRole: UserRole =
    direction === "nanny_to_parent" ? "parent" : "nanny";
  if (expectedRecipientRole !== expectedRole) {
    return null;
  }

  return { token, direction };
}

function inviteSignupSource(direction: InviteDirection): string {
  return direction === "nanny_to_parent" ? "nanny_invite" : "parent_invite";
}

export interface ActionResult {
  error?: string;
  success?: boolean;
  redirectTo?: string;
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  // Clear any existing session first to prevent conflicts
  await supabase.auth.signOut();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const role = formData.get("role") as UserRole;
  const rawInviteToken =
    (formData.get("invite_token") as string | null) ?? null;

  // Resolve invite context up-front so we can override signup_source.
  // Invalid / mismatched tokens are silently dropped — the standard signup
  // proceeds and the user simply lands on the dashboard.
  let inviteContext: InviteContext | null = null;
  if (rawInviteToken) {
    inviteContext = await lookupValidInvite(rawInviteToken, role);
  }
  const signupSource = inviteContext
    ? inviteSignupSource(inviteContext.direction)
    : (formData.get("signupSource") as string) || "direct";

  // Validate required fields
  if (!email || !password || !firstName || !lastName || !role) {
    return { error: "All fields are required" };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  // Validate password strength
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (!/[0-9]/.test(password)) {
    return { error: "Password must include a number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { error: "Password must include a special character" };
  }

  // Validate role
  if (!["nanny", "parent"].includes(role)) {
    return { error: "Invalid role" };
  }

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: capitalizeName(firstName),
        last_name: capitalizeName(lastName),
      },
    },
  });

  if (authError) {
    console.error("Auth signup error:", authError);
    if (authError.message.includes("already registered")) {
      return { error: "An account with this email already exists" };
    }
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user account" };
  }

  const userId = authData.user.id;

  // Use admin client for post-signup inserts to bypass RLS
  // The user's session isn't fully established yet, so RLS auth.uid() checks fail
  const adminClient = createAdminClient();

  try {
    // 2. Insert user role
    const { error: roleError } = await adminClient
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (roleError) {
      console.error("Role insert error:", roleError);
      // Clean up auth user on failure
      await adminClient.auth.admin.deleteUser(userId);
      return { error: "Failed to set up user role. Please try again." };
    }

    // 3. Insert user profile
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .insert({
        user_id: userId,
        first_name: capitalizeName(firstName),
        last_name: capitalizeName(lastName),
        email: email,
      });

    if (profileError) {
      console.error("Profile insert error:", profileError);
      // Clean up auth user and role on failure
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.auth.admin.deleteUser(userId);
      return { error: "Failed to create user profile. Please try again." };
    }

    // 4. Insert role-specific record (nanny or parent)
    if (role === "nanny") {
      const { error: nannyError } = await adminClient.from("nannies").insert({
        user_id: userId,
        status: "pending_verification",
        verification_tier: "tier1",
      });

      if (nannyError) {
        console.error("Nanny insert error:", nannyError);
        return { error: "Failed to create nanny profile. Please try again." };
      }
    } else if (role === "parent") {
      const { error: parentError } = await adminClient.from("parents").insert({
        user_id: userId,
        status: "active",
        signup_source: signupSource,
      });

      if (parentError) {
        console.error("Parent insert error:", parentError);
        return { error: "Failed to create parent profile. Please try again." };
      }
    }

    // 5. Insert user progress
    const { error: progressError } = await adminClient
      .from("user_progress")
      .insert({
        user_id: userId,
        stage: role === "nanny" ? "nanny_profile_created" : "parent_signup",
      });

    if (progressError) {
      console.error("Progress insert error:", progressError);
      // Non-critical, don't fail the signup
    }

    // 6. Send welcome email (fire-and-forget)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://app-babybloom.vercel.app";
    const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;`;
    const btnStyle = `background: #8B5CF6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;`;

    if (role === "nanny") {
      sendEmail({
        to: email,
        subject: `Welcome to Baby Bloom, ${firstName}!`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#f8fafc;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#f5f3ff;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">&#127881;</div>
    </div>
    <h1 style="font-size:24px;font-weight:700;text-align:center;margin:0 0 8px;">Welcome, ${firstName}!</h1>
    <p style="text-align:center;color:#64748b;margin:0 0 24px;">Your Baby Bloom account has been created.</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;">We're excited to have you join Baby Bloom Sydney. Here's how to get started:</p>
    <div style="background:#f5f3ff;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#7c3aed;">Next steps</p>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.8;">
        <li>Complete your profile with your experience and qualifications</li>
        <li>Upload your ID and WWCC for verification</li>
        <li>Once verified, families in Sydney can find and connect with you</li>
      </ol>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="${appUrl}/nanny/profile" style="${btnStyle}">Complete Your Profile</a>
    </div>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;">
        Baby Bloom Sydney<br/>
        <a href="https://babybloomsydney.com.au/legal/privacy-policy" style="color:#7c3aed;">Privacy Policy</a> |
        <a href="https://babybloomsydney.com.au/legal/professional-terms" style="color:#7c3aed;">Terms of Service</a>
      </p>
    </div>
  </div>
</div>
</body></html>`,
        emailType: "welcome",
        recipientUserId: userId,
      }).catch((err) => console.error("[Signup] ACC-001 email error:", err));
    } else {
      sendEmail({
        to: email,
        subject: `Welcome to Baby Bloom, ${firstName}!`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#f8fafc;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#f5f3ff;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">&#127881;</div>
    </div>
    <h1 style="font-size:24px;font-weight:700;text-align:center;margin:0 0 8px;">Welcome, ${firstName}!</h1>
    <p style="text-align:center;color:#64748b;margin:0 0 24px;">Your Baby Bloom account has been created.</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;">We're excited to have you join Baby Bloom Sydney. Here's how to get started:</p>
    <div style="background:#f5f3ff;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#7c3aed;">Next steps</p>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#475569;line-height:1.8;">
        <li>Browse our verified, education-focused nannies</li>
        <li>Create a position to start matching with the right nanny</li>
        <li>Request a meet and greet when you find a great fit</li>
      </ol>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="${appUrl}/parent/dashboard" style="${btnStyle}">Go to Your Dashboard</a>
    </div>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;">
        Baby Bloom Sydney<br/>
        <a href="https://babybloomsydney.com.au/legal/privacy-policy" style="color:#7c3aed;">Privacy Policy</a> |
        <a href="https://babybloomsydney.com.au/legal/client-terms" style="color:#7c3aed;">Terms of Service</a>
      </p>
    </div>
  </div>
</div>
</body></html>`,
        emailType: "welcome",
        recipientUserId: userId,
      }).catch((err) => console.error("[Signup] ACC-002 email error:", err));
    }

    // 7. If signup came in via an invite link, stamp recipient_user_id
    //    on the invite row and route the user to the invite landing page
    //    so they can claim it. Tracking-only — does NOT create the link.
    if (inviteContext) {
      const stampResult = await signupViaInvite({
        token: inviteContext.token,
        userId,
      });
      if (!stampResult.success) {
        // Non-fatal: account exists, user can still claim manually by
        // visiting the invite URL.
        console.error(
          "[Signup] signupViaInvite failed (non-fatal):",
          stampResult.error,
        );
      }
      // `?auto=1` tells InviteLandingClient to auto-fire `connect` once the
      // page mounts so the freshly-signed-up parent doesn't have to tap a
      // second "Connect" button. Switch-ack and other gates still apply
      // client-side; auto-mode skips itself when those are present.
      return {
        success: true,
        redirectTo: `/invite/${inviteContext.token}?auto=1`,
      };
    }

    return {
      success: true,
      redirectTo: getDashboardPath(role),
    };
  } catch (error) {
    console.error("Signup error:", error);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  // Clear any existing session first to prevent conflicts
  await supabase.auth.signOut();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Sign in error:", error);
    if (error.message.includes("Invalid login credentials")) {
      return { error: "Invalid email or password" };
    }
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Failed to sign in" };
  }

  // Fetch user role to determine redirect
  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  if (roleError || !roleData) {
    console.error("Role fetch error:", roleError);
    return { error: "Failed to fetch user role" };
  }

  const role = roleData.role as UserRole;
  return {
    success: true,
    redirectTo: getDashboardPath(role),
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = createClient();

  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("Forgot password error:", error);
    return { error: "Failed to send reset email. Please try again." };
  }

  return { success: true };
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || !confirmPassword) {
    return { error: "Both password fields are required" };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (!/[0-9]/.test(password)) {
    return { error: "Password must include a number" };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { error: "Password must include a special character" };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error("Reset password error:", error);
    return { error: "Failed to reset password. Please try again." };
  }

  return { success: true, redirectTo: "/login" };
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as UserRole;
}
