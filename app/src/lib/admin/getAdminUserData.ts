/**
 * Single-user UserData loader for admin surfaces other than
 * `/admin/users`. Mirrors the shape of `getUsers()` in
 * `app/admin/users/page.tsx` so the UserDetailDrawer can render
 * unchanged.
 *
 * Used by the subscription detail page to open the same drawer
 * in-place without redirecting through `/admin/users`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { UserData } from "@/app/admin/users/page";

export async function getAdminUserData(
  userId: string,
): Promise<UserData | null> {
  const supabase = createAdminClient();

  const [profileRes, roleRes, nannyRes, parentRes, verificationRes] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "user_id, first_name, last_name, email, suburb, postcode, profile_picture_url, mobile_number, date_of_birth, created_at",
        )
        .eq("user_id", userId)
        .maybeSingle<{
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          suburb: string | null;
          postcode: string | null;
          profile_picture_url: string | null;
          mobile_number: string | null;
          date_of_birth: string | null;
          created_at: string;
        }>(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle<{ role: string }>(),
      supabase
        .from("nannies")
        .select(
          "id, status, verification_level, wwcc_verified, identity_verified, visible_in_bsr",
        )
        .eq("user_id", userId)
        .maybeSingle<{
          id: string;
          status: string;
          verification_level: number;
          wwcc_verified: boolean;
          identity_verified: boolean;
          visible_in_bsr: boolean;
        }>(),
      supabase
        .from("parents")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle<{ status: string }>(),
      supabase
        .from("verifications")
        .select("verification_status")
        .eq("user_id", userId)
        .maybeSingle<{ verification_status: number }>(),
    ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const nanny = nannyRes.data;
  const parent = parentRes.data;

  return {
    user_id: profile.user_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    suburb: profile.suburb,
    postcode: profile.postcode,
    profile_picture_url: profile.profile_picture_url,
    mobile_number: profile.mobile_number,
    date_of_birth: profile.date_of_birth,
    created_at: profile.created_at,
    role: roleRes.data?.role ?? "unknown",
    nanny_status: nanny?.status ?? null,
    verification_level: nanny?.verification_level ?? null,
    verification_status: verificationRes.data?.verification_status ?? null,
    wwcc_verified: nanny?.wwcc_verified ?? null,
    identity_verified: nanny?.identity_verified ?? null,
    parent_status: parent?.status ?? null,
    babysitter_eligible: nanny?.visible_in_bsr ?? null,
    nanny_id: nanny?.id ?? null,
  };
}
