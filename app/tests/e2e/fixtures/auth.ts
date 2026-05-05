/**
 * Auth fixtures for authenticated Playwright E2E tests.
 *
 * Creates test users via the Supabase admin client (service role),
 * mirroring the rows that the live signUp action would create:
 *   - auth.users
 *   - user_roles
 *   - user_profiles
 *   - nannies OR parents (role-specific row)
 *
 * Why we don't drive the signup UI for fixture creation: it would
 * triple the setup time per test and isn't what we're testing here
 * (signup is exercised by separate tests). For these flow tests we
 * just need authenticated sessions.
 *
 * Cleanup: every fixture user gets the `playwright_e2e_` email prefix
 * + a consistent first_name token so the cleanup helper at the bottom
 * can reliably delete them after the run.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "auth fixtures require NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env",
  );
}

// Admin client — bypasses RLS, can create users + insert role rows.
export const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Test-Password-2026!"; // common to all fixture users
export const TEST_EMAIL_PREFIX = "playwright_e2e_";
export const TEST_FIRST_NAME_TOKEN = "PlaywrightE2E";

export interface TestUser {
  userId: string;
  email: string;
  password: string;
  role: "nanny" | "parent";
}

/**
 * Creates a fully-provisioned test user. Mirrors the rows that the
 * production `signUp` server action creates, minus the welcome email
 * + user_progress (non-essential for flow tests).
 */
export async function createTestUser(
  role: "nanny" | "parent",
  emailSuffix: string,
): Promise<TestUser> {
  const email = `${TEST_EMAIL_PREFIX}${emailSuffix}@example.com`;

  // 1. auth.users — email_confirm:true so we don't have to wait for the
  // confirm email click in tests.
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: TEST_FIRST_NAME_TOKEN,
        last_name: emailSuffix,
      },
    });
  if (authError || !authData.user) {
    throw new Error(
      `createTestUser(${role}) auth failed: ${authError?.message}`,
    );
  }
  const userId = authData.user.id;

  // 2. user_roles
  await admin.from("user_roles").insert({ user_id: userId, role });

  // 3. user_profiles
  await admin.from("user_profiles").insert({
    user_id: userId,
    first_name: TEST_FIRST_NAME_TOKEN,
    last_name: emailSuffix,
    email,
  });

  // 4. role-specific row
  if (role === "nanny") {
    // verification_level=3 unlocks the Education tab in NannyHubClient
    // (`isTabsLocked = verificationLevel < 3`). Without this the nanny
    // is stuck on the verification tab and can't reach Add a child.
    await admin.from("nannies").insert({
      user_id: userId,
      status: "active",
      verification_tier: "tier3",
      verification_level: 3,
    });
  } else {
    // Parent dashboard isn't tabs-locked; default verification_level
    // works fine for the Education flow.
    await admin.from("parents").insert({
      user_id: userId,
      status: "active",
      signup_source: "playwright_e2e",
    });
  }

  return { userId, email, password: PASSWORD, role };
}

/**
 * Deletes test users created by this fixture suite.
 *
 * Pass `scopedSubstring` (e.g. "pathA_") so each spec file only cleans
 * up its own users — parallel runs across spec files won't trample
 * each other's fixtures. With no argument, deletes ALL playwright
 * fixtures (use only from the cleanup-script entry point).
 */
export async function cleanupTestUsers(
  scopedSubstring?: string,
): Promise<void> {
  const emailPattern = scopedSubstring
    ? `${TEST_EMAIL_PREFIX}${scopedSubstring}%`
    : `${TEST_EMAIL_PREFIX}%`;

  // List fixture users matching the scope.
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, email")
    .like("email", emailPattern);

  if (!profiles || profiles.length === 0) return;

  const userIds = profiles.map((p) => p.user_id);

  // Delete child_client rows owned by these users (cascades to invites,
  // events, bapp_logs).
  await admin.from("child_client").delete().in("nanny_user_id", userIds);
  await admin.from("child_client").delete().in("parent_user_id", userIds);

  // End any active placements involving these users.
  const { data: nannies } = await admin
    .from("nannies")
    .select("id")
    .in("user_id", userIds);
  const { data: parents } = await admin
    .from("parents")
    .select("id")
    .in("user_id", userIds);

  const nannyIds = nannies?.map((n) => n.id) ?? [];
  const parentIds = parents?.map((p) => p.id) ?? [];

  if (nannyIds.length > 0) {
    await admin.from("nanny_placements").delete().in("nanny_id", nannyIds);
    await admin.from("nannies").delete().in("user_id", userIds);
  }
  if (parentIds.length > 0) {
    await admin.from("nanny_placements").delete().in("parent_id", parentIds);
    await admin.from("parents").delete().in("user_id", userIds);
  }

  // Profile + role rows.
  await admin.from("user_profiles").delete().in("user_id", userIds);
  await admin.from("user_roles").delete().in("user_id", userIds);

  // Finally the auth.users themselves.
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {
      // Already gone? Fine.
    });
  }
}
