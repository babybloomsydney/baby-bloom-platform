/**
 * A-08 Katie-guided onboarding cascade — e2e flow.
 *
 * Spec: `system/APP/Ammendments/V 1.1/A-08-katie-guided-onboarding.md`
 *
 * Covers the post-child-creation cascade end-to-end against a real
 * Supabase instance:
 *   1. Nanny signs in, opens the Education tab, adds a child.
 *   2. Server action emits the celebration tile (synchronous,
 *      atomic-ish with the child insert) into the bapp_logs feed.
 *   3. Nanny navigates to the child's development feed.
 *   4. The "Continue setup with Katie" resume banner appears at the
 *      top of the feed (fresh-skip variant — onboarding_state may
 *      not be initialised yet, in which case the banner is hidden;
 *      we assert based on the celebration tile being present + the
 *      banner state matching what the server returns).
 *   5. Banner dismiss persists: clicking × flips
 *      `onboarding_dismissed=true` in `bloombot.settings`. Reloading
 *      the page does not re-show the banner.
 *
 * Out of scope here:
 *   - Real proactive trigger dispatch (the welcome message landing
 *     in Katie's bot). That goes through the dispatcher's async
 *     fire-and-forget path and is non-deterministic over a short
 *     wall-clock window — covered by unit tests instead.
 *   - Parent path. The parent.connected_to_child trigger fires from
 *     `connectChildInvite`; the existing invite-flow specs (paths
 *     A-D) already drive that flow end-to-end. Adding a parent-side
 *     banner assertion would duplicate their setup.
 *
 * PRECONDITIONS:
 *   - Dev server running (`npm run dev`).
 *   - INVITE_LINKS_ENABLED=true in `.env.local` (the Add Child flow
 *     mints an invite even on the celebration-tile-only path here).
 *   - PLAYWRIGHT_TEST_INVITES_ENABLED=true on the runner (gates the
 *     env-dependent specs from running in dry CI).
 *   - PLAYWRIGHT_BASE_URL points at the dev server (defaults to :3000).
 *
 * Cleanup: every fixture user is prefixed `playwright_e2e_pathK_`.
 * The afterAll hook hard-deletes them + cascades.
 */

import { test, expect } from "@playwright/test";
import {
  admin,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from "./fixtures/auth";
import { signInAs } from "./fixtures/sign-in";

const INVITES_ENABLED = process.env.PLAYWRIGHT_TEST_INVITES_ENABLED === "true";

test.describe("A-08 — Katie onboarding cascade (nanny side)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true",
  );

  test.setTimeout(120_000);

  let nanny: TestUser;

  test.beforeAll(async () => {
    await cleanupTestUsers("pathK_");
    const stamp = Date.now();
    nanny = await createTestUser("nanny", `pathK_nanny_${stamp}`);
  });

  test.afterAll(async () => {
    await cleanupTestUsers("pathK_");
  });

  test("celebration tile lands in feed + resume banner reflects bot state", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    const context = await signInAs(browser, nanny, baseURL!);
    const page = await context.newPage();
    await page.goto("/nanny");

    // ── 1. Open Education tab if needed.
    const educationTab = page.getByRole("button", { name: /education/i });
    if (await educationTab.isVisible().catch(() => false)) {
      await educationTab.click();
    }

    // ── 2. Add child via the chooser → AddChildSheet.
    await page.getByRole("button", { name: /add a child/i }).click();
    await page.getByRole("button", { name: /add new child/i }).click();

    const childFirstName = `KatieE2E${Date.now()}`;
    await page.getByLabel(/first name/i).fill(childFirstName);
    await page.getByLabel(/date of birth/i).fill("2024-01-15");
    // AGR-14 guardian disclaimer.
    await page
      .locator(
        'input[type="checkbox"][required], label:has-text("guardian") input',
      )
      .first()
      .check();

    await page.getByRole("button", { name: /^add child/i }).click();

    // The sheet pivots to share-invite state. We don't need the URL
    // here — just confirmation the action completed.
    await expect(
      page.locator('input[readonly][value*="/invite/"]'),
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Find the child id (the bapp_log was written on the same
    //       admin client as the child insert, so the child row exists).
    const { data: childRow } = await admin
      .from("child_client")
      .select("id")
      .eq("nanny_user_id", nanny.userId)
      .eq("first_name", childFirstName)
      .maybeSingle();
    expect(childRow?.id).toBeTruthy();
    const childId = childRow!.id as string;

    // ── 4. Celebration tile — A-08 atomic contract: a custom-typed
    //       bapp_log row with sparkles + violet branding.
    const { data: tileRow } = await admin
      .from("bapp_logs")
      .select("type, status, context, data")
      .eq("child_client_id", childId)
      .eq("type", "custom")
      .maybeSingle();
    expect(tileRow).toBeTruthy();
    expect(tileRow!.status).toBe("completed");
    expect(tileRow!.context).toBe("adhoc");
    const data = tileRow!.data as Record<string, unknown>;
    expect(data.icon).toBe("sparkles");
    expect(data.color).toBe("violet");
    expect(String(data.heading)).toContain(childFirstName);

    // ── 5. Navigate to the child's development feed. The
    //       celebration tile should render via CustomTile.
    await page.goto(`/nanny/development/${childId}`);
    await expect(
      page.getByText(`${childFirstName} has been added to BabyBloom`),
    ).toBeVisible({ timeout: 10_000 });

    // ── 6. Resume banner — it appears only when bloombot.settings
    //       has an in-progress onboarding_state with at least one
    //       pending topic. The proactive dispatch is fire-and-forget
    //       so it may not have written state yet at the moment we
    //       arrive. Read the bloombot row to derive expected state
    //       and assert the UI matches.
    const { data: bot } = await admin
      .from("bloombot")
      .select("settings")
      .eq("user_id", nanny.userId)
      .maybeSingle();

    const settings = (bot?.settings ?? {}) as {
      onboarding_completed?: boolean;
      onboarding_dismissed?: boolean;
      onboarding_state?: { topics?: Record<string, { status: string }> };
    };
    const topics = settings.onboarding_state?.topics ?? {};
    const hasPending = Object.values(topics).some(
      (t) => t.status === "pending",
    );
    const bannerExpectedVisible =
      settings.onboarding_completed !== true &&
      settings.onboarding_dismissed !== true &&
      hasPending;

    if (bannerExpectedVisible) {
      // ── 6a. Banner visible: assert + dismiss + reload.
      const banner = page.locator(
        'section[aria-labelledby="resume-banner-headline"]',
      );
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await page.getByRole("button", { name: /^dismiss$/i }).click();
      await expect(banner).not.toBeVisible({ timeout: 5_000 });

      // DB-side: onboarding_dismissed flipped true.
      // Allow a small grace window for the optimistic-update
      // server action to settle.
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("bloombot")
              .select("settings")
              .eq("user_id", nanny.userId)
              .maybeSingle();
            return (
              (data?.settings ?? {}) as { onboarding_dismissed?: boolean }
            ).onboarding_dismissed;
          },
          { timeout: 10_000 },
        )
        .toBe(true);

      // Reload — banner stays gone.
      await page.reload();
      await expect(banner).not.toBeVisible({ timeout: 5_000 });
    } else {
      // ── 6b. Banner NOT expected: confirm the section is absent.
      // This branch covers the timing where the proactive dispatch
      // has not yet written onboarding_state. The cascade is still
      // recoverable via natural-language re-trigger (per spec).
      await expect(
        page.locator('section[aria-labelledby="resume-banner-headline"]'),
      ).toHaveCount(0);
    }

    await context.close();
  });
});
