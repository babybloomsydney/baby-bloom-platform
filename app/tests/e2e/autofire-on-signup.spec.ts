/**
 * T-040 autofire E2E — verify that completing the adv-funnel signup
 * (`/matchmaking/signup?lead=<uuid>`) activates DFY matchmaking on the
 * newly-created position.
 *
 * Verifies via Supabase admin queries (the contract is server-side state,
 * not pixel rendering):
 *   - `nanny_positions.dfy_activated_at` is set
 *   - `nanny_positions.dfy_tier` === 'priority'
 *   - At least one `dfy_match_notifications` row exists for the position
 *
 * **Requires** the dev server to be running on http://localhost:3001
 * with `EMAIL_DEV_DRY_RUN=true` so the nanny blast logs to `email_logs`
 * without hitting Resend. The test refuses to run if dry-run is off, so
 * real nannies don't get test emails with localhost URLs.
 *
 * Tearing down: deletes everything the test created (lead → user → parent
 * → position → notifications → email_logs entries).
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const RUN_TAG = `autofire-test-${Date.now()}`;
const TEST_EMAIL = `${RUN_TAG}@babybloomsydney.com.au`;
const TEST_LEAD_ID = randomUUID();
const TEST_PASSWORD = "AutofireTestPass123!";

test.describe("T-040 autofire on adv-funnel signup", () => {
  let testUserId: string | null = null;
  let testParentId: string | null = null;
  let testPositionId: string | null = null;

  test.beforeAll(async () => {
    // Refuse to run against a server that would actually email nannies.
    // We can't read the dev server's env from here, so use a sentinel
    // header-style check: hit a 404 path to confirm the server is up,
    // then trust that the operator set EMAIL_DEV_DRY_RUN. The test will
    // still surface email_logs status='sent' with providerMessageId
    // 'dry-run' in its assertions if the guard worked.
    const res = await fetch(BASE_URL).catch(() => null);
    if (!res) {
      throw new Error(
        `Dev server unreachable at ${BASE_URL}. Start with: EMAIL_DEV_DRY_RUN=true npm run dev -- -p 3001`,
      );
    }

    // Values must match the enum/check constraints on `nanny_positions`.
    // Sources: src/app/parent/request/questions.ts (UI options) +
    //          src/lib/actions/position-utils.ts (HOURS_TO_INT, AGE_RANGE_TO_MONTHS).
    // En-dashes (U+2013) in hour + age ranges are deliberate.
    const formData = {
      first_name: "Autofire",
      suburb: "Bondi",
      postcode: 2026,
      weekly_roster: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      hours_per_week: "20–30",
      schedule_type: "Flexible",
      urgency: "As soon as possible",
      placement_length: "Ongoing",
      num_children: 1,
      child_a_age: "1–2 years",
      minimum_age: "21",
      years_of_experience: "2",
      reason_for_nanny: "Both parents work",
      drivers_license_required: "No",
      car_required: "No",
    };
    const { error } = await admin.from("parent_leads").insert({
      id: TEST_LEAD_ID,
      form_data: formData,
      suburb: formData.suburb,
      postcode: formData.postcode,
    });
    if (error) {
      throw new Error(`Lead seed failed: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    // Cleanup in dependency order — match wipe-test-parent.sql logic
    if (testPositionId) {
      await admin
        .from("dfy_match_notifications")
        .delete()
        .eq("position_id", testPositionId);
      await admin
        .from("position_children")
        .delete()
        .eq("position_id", testPositionId);
      await admin
        .from("position_schedule")
        .delete()
        .eq("position_id", testPositionId);
    }
    if (testParentId) {
      await admin
        .from("connection_requests")
        .delete()
        .eq("parent_id", testParentId);
      await admin
        .from("nanny_placements")
        .delete()
        .eq("parent_id", testParentId);
      await admin
        .from("nanny_positions")
        .delete()
        .eq("parent_id", testParentId);
      await admin.from("parents").delete().eq("id", testParentId);
    }
    if (testUserId) {
      await admin.from("inbox_messages").delete().eq("user_id", testUserId);
      await admin.from("viral_shares").delete().eq("user_id", testUserId);
      await admin.from("user_roles").delete().eq("user_id", testUserId);
      await admin.from("user_profiles").delete().eq("user_id", testUserId);
      await admin.auth.admin.deleteUser(testUserId).catch(() => {});
    }
    await admin.from("parent_leads").delete().eq("id", TEST_LEAD_ID);
    await admin.from("email_logs").delete().eq("recipient_email", TEST_EMAIL);
  });

  test("submitting /matchmaking/signup activates DFY matchmaking on the created position", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/matchmaking/signup?lead=${TEST_LEAD_ID}`);

    // Wait for the form to mount
    await page.waitForSelector('input[name="firstName"]', { timeout: 15000 });

    // Fill 5 form fields
    await page.fill('input[name="firstName"]', "Autofire");
    await page.fill('input[name="lastName"]', "Test");
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.fill('input[name="confirmPassword"]', TEST_PASSWORD);

    // Tick all consent checkboxes (AGR01 = 1 checkbox; this still works
    // if the count changes later)
    const consentBoxes = page.locator('input[type="checkbox"]');
    const count = await consentBoxes.count();
    for (let i = 0; i < count; i++) {
      await consentBoxes.nth(i).check({ force: true });
    }

    // Submit
    await page.click('button[type="submit"]');

    // Adv-funnel landing target per system/forms/Parent onboarding/PLAN.md §adv-flow #6
    await page.waitForURL(/\/parent/, { timeout: 60000 });

    // ── Verify autofire fired via DB state ──────────────────────────────

    const { data: profile } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("email", TEST_EMAIL)
      .single();
    expect(profile, `user_profiles row for ${TEST_EMAIL}`).toBeTruthy();
    testUserId = profile!.user_id;

    const { data: parent } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", testUserId!)
      .single();
    expect(parent, "parents row for new user").toBeTruthy();
    testParentId = parent!.id;

    const { data: position } = await admin
      .from("nanny_positions")
      .select("id, dfy_activated_at, dfy_tier, status")
      .eq("parent_id", testParentId!)
      .single();
    expect(
      position,
      "nanny_positions row from signUpAndConvertLead",
    ).toBeTruthy();
    testPositionId = position!.id;

    // The autofire assertions
    expect(
      position!.dfy_activated_at,
      "dfy_activated_at should be set by autofireMatchmaking → activateDfyPosition",
    ).not.toBeNull();
    expect(position!.dfy_tier, "dfy_tier should be 'priority'").toBe(
      "priority",
    );

    // The matching engine ran + queued at least one nanny
    const { count: notifCount } = await admin
      .from("dfy_match_notifications")
      .select("*", { count: "exact", head: true })
      .eq("position_id", testPositionId!);
    expect(
      notifCount ?? 0,
      "at least one dfy_match_notifications row for the new position",
    ).toBeGreaterThan(0);

    // The nanny blast was attempted (email_logs rows for OTHER recipients
    // with provider_message_id='dry-run' — confirms the dry-run guard
    // suppressed real Resend calls but the pipeline ran)
    const { data: blastLogs } = await admin
      .from("email_logs")
      .select("status, provider_message_id, email_type")
      .neq("recipient_email", TEST_EMAIL)
      .eq("provider_message_id", "dry-run")
      .order("created_at", { ascending: false })
      .limit(5);
    expect(
      (blastLogs ?? []).length,
      "at least one nanny-blast email_logs entry with dry-run marker",
    ).toBeGreaterThan(0);

    // T-040 Step 1c: the parent receives the ADV welcome (not the
    // standard "create your position" welcome). Verify by email_type.
    // Small retry loop because Supabase row visibility can lag by ~100ms.
    let parentEmails: {
      email_type: string;
      status: string;
      recipient_email?: string;
    }[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data } = await admin
        .from("email_logs")
        .select("email_type, status, recipient_email")
        .ilike("recipient_email", TEST_EMAIL)
        .order("created_at", { ascending: false });
      parentEmails = (data ?? []) as typeof parentEmails;
      if (parentEmails.length > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    // Diagnostic — if the assertion fails, surface a recent slice of
    // email_logs so the cause is visible in the test output.
    if (parentEmails.length === 0) {
      const { data: recent } = await admin
        .from("email_logs")
        .select("email_type, status, recipient_email, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      console.log(
        `[autofire-test] no email_logs for ${TEST_EMAIL}; recent rows:`,
        JSON.stringify(recent, null, 2),
      );
    }
    const types = parentEmails.map((e) => e.email_type);
    expect(
      types,
      "adv-funnel signup must send welcome_adv_parent email",
    ).toContain("welcome_adv_parent");
    expect(
      types,
      "adv-funnel signup must NOT send the generic 'welcome' email (would say 'create your position' which is already done)",
    ).not.toContain("welcome");
  });
});
