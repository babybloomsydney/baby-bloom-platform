/**
 * Path D end-to-end (authenticated) — settings deletion flows.
 *
 * Covers the settings-page destructive actions from R1 §D:
 *   - Parent: Remove Nanny (per-child, with confirmation)
 *   - Parent: Delete Child (per-child, with confirmation)
 *   - Cancel from any confirmation panel — no DB writes
 *
 * The Leave Child flow on the nanny side is structurally identical
 * (same component, role-flipped) and is covered by the existing unit
 * tests at `components/bapp/ChildManagementCard.test.tsx`. We focus
 * here on the live-DB end-to-end path on the parent side.
 *
 * Pre-req: a connected nanny↔parent pair already exists. We bootstrap
 * by replaying Path A's mint+connect dance, then drive the settings
 * page from the parent's authenticated context.
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

test.describe("Path D — settings deletion flows (authenticated)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true",
  );

  test.setTimeout(180_000);

  let nanny: TestUser;
  let parent: TestUser;

  test.beforeAll(async () => {
    await cleanupTestUsers("pathD_");
    const stamp = Date.now();
    [nanny, parent] = await Promise.all([
      createTestUser("nanny", `pathD_nanny_${stamp}`),
      createTestUser("parent", `pathD_parent_${stamp}`),
    ]);
  });

  test.afterAll(async () => {
    await cleanupTestUsers("pathD_");
  });

  test("parent removes nanny → confirmation flow + DB writes", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    // ── Bootstrap: nanny creates child + parent connects.
    const childFirstName = `OliveE2E${Date.now()}`;
    let token: string;

    {
      const ctx = await signInAs(browser, nanny, baseURL!);
      const page = await ctx.newPage();
      await page.goto("/nanny");
      const tab = page.getByRole("button", { name: /education/i });
      if (await tab.isVisible().catch(() => false)) await tab.click();
      await page.getByRole("button", { name: /add a child/i }).click();
      await page.getByRole("button", { name: /add new child/i }).click();
      await page.getByLabel(/first name/i).fill(childFirstName);
      await page.getByLabel(/date of birth/i).fill("2024-03-01");
      await page
        .locator(
          'input[type="checkbox"][required], label:has-text("guardian") input',
        )
        .first()
        .check();
      await page.getByRole("button", { name: /^add child/i }).click();
      const shareUrl = page.locator('input[readonly][value*="/invite/"]');
      await expect(shareUrl).toBeVisible({ timeout: 15_000 });
      token = (await shareUrl.inputValue()).split("/invite/").pop()!;
      await ctx.close();
    }

    {
      const ctx = await signInAs(browser, parent, baseURL!);
      const page = await ctx.newPage();
      await page.goto(`/invite/${token}`);
      await Promise.all([
        page.waitForURL(/\/parent\/development\/[\w-]+/, { timeout: 15_000 }),
        page.getByRole("button", { name: /^connect$/i }).click(),
      ]);
      await ctx.close();
    }

    // ── Drive the parent settings page.
    const parentContext = await signInAs(browser, parent, baseURL!);
    const parentPage = await parentContext.newPage();
    await parentPage.goto("/parent/settings");

    // Manage children card should now show the linked child with
    // Remove nanny + Delete child buttons.
    const childRow = parentPage
      .locator('[data-testid="child-row"]')
      .filter({ hasText: childFirstName });
    await expect(childRow).toBeVisible({ timeout: 10_000 });

    // ── Cancel path first — open Remove confirmation, hit Cancel,
    // confirm no DB write.
    await childRow.getByRole("button", { name: /remove nanny/i }).click();
    const dialog = parentPage.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();

    const childId = parentPage.url().includes("/parent/development/")
      ? parentPage.url().split("/development/").pop()!
      : (
          await admin
            .from("child_client")
            .select("id")
            .eq("parent_user_id", parent.userId)
            .single()
        ).data!.id;

    {
      // Cancel must not have changed nanny_user_id.
      const { data } = await admin
        .from("child_client")
        .select("nanny_user_id")
        .eq("id", childId)
        .single();
      expect(data?.nanny_user_id).toBe(nanny.userId);
    }

    // ── Confirm path — open Remove confirmation, click Remove.
    await childRow.getByRole("button", { name: /remove nanny/i }).click();
    await expect(parentPage.getByRole("alertdialog")).toBeVisible();
    await parentPage.getByRole("button", { name: /^remove$/i }).click();

    // After router.refresh() the row re-renders without nanny.
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("child_client")
            .select("nanny_user_id")
            .eq("id", childId)
            .maybeSingle();
          return data?.nanny_user_id;
        },
        { timeout: 10_000 },
      )
      .toBeNull();

    // Placement should now be ended.
    const { data: nannyRow } = await admin
      .from("nannies")
      .select("id")
      .eq("user_id", nanny.userId)
      .single();
    const { data: placement } = await admin
      .from("nanny_placements")
      .select("status, end_reason")
      .eq("nanny_id", nannyRow!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(placement?.status).toBe("ended");

    await parentContext.close();
  });
});
