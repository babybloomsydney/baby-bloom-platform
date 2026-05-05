/**
 * Path A end-to-end (authenticated) — nanny → parent invite flow.
 *
 * Replicates the R1 manual smoke checklist Path A, fully automated:
 *   1. Nanny opens /nanny/?t=education, taps "Add a child"
 *   2. Nanny picks "Add new child", fills form, submits
 *   3. Nanny receives the invite URL in the share panel
 *   4. (Switch to parent context) Parent opens the invite URL
 *   5. Parent taps Connect on the ready_to_connect state
 *   6. Parent lands on /parent/development/{childId}
 *   7. DB sanity: child_client has both link columns + status=connected invite
 *
 * PRECONDITIONS:
 *   - Dev server running (`npm run dev`).
 *   - INVITE_LINKS_ENABLED=true in `.env.local` (this is the soak state,
 *     NOT the default. Tests skip when it's false to avoid running
 *     against the kill-switch panic state.)
 *   - PLAYWRIGHT_TEST_INVITES_ENABLED=true on the runner.
 *   - PLAYWRIGHT_BASE_URL points at the dev server (defaults to :3000).
 *
 * Cleanup: every fixture user is prefixed `playwright_e2e_`. The
 * afterAll hook hard-deletes them + cascades. If the test crashes
 * mid-run, run the cleanup helper standalone:
 *   `npx tsx tests/e2e/fixtures/cleanup-script.ts`
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

test.describe("Path A — nanny → parent invite (authenticated)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true",
  );

  // Long timeout — full flow involves 2 dashboard nav + invite mint +
  // public landing + RPC + final dashboard nav. Runs against live
  // Supabase, so jitter happens.
  test.setTimeout(120_000);

  let nanny: TestUser;
  let parent: TestUser;

  test.beforeAll(async () => {
    // Best-effort cleanup of any stale fixtures from a previous crash.
    await cleanupTestUsers("pathA_");
    const stamp = Date.now();
    [nanny, parent] = await Promise.all([
      createTestUser("nanny", `pathA_nanny_${stamp}`),
      createTestUser("parent", `pathA_parent_${stamp}`),
    ]);
  });

  test.afterAll(async () => {
    await cleanupTestUsers("pathA_");
  });

  test("nanny creates child → parent connects → both see the link", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    // ── 1-3. Nanny mints the invite.
    const nannyContext = await signInAs(browser, nanny, baseURL!);
    const nannyPage = await nannyContext.newPage();
    await nannyPage.goto("/nanny");

    // Switch to Education tab. The tab is rendered inside ParentHubClient/
    // NannyHubClient; depending on viewport it may already be visible or
    // require clicking the tab nav.
    const educationTab = nannyPage.getByRole("button", {
      name: /education/i,
    });
    if (await educationTab.isVisible().catch(() => false)) {
      await educationTab.click();
    }

    // Tap "Add a child" → opens the chooser modal.
    await nannyPage.getByRole("button", { name: /add a child/i }).click();

    // Pick "Add new child" inside the chooser.
    await nannyPage.getByRole("button", { name: /add new child/i }).click();

    // Fill the AddChildSheet (nanny variant — has the AGR-14 disclaimer).
    const childFirstName = `EvieE2E${Date.now()}`;
    await nannyPage.getByLabel(/first name/i).fill(childFirstName);
    await nannyPage.getByLabel(/date of birth/i).fill("2024-01-15");

    // Tick the disclaimer.
    await nannyPage
      .locator(
        'input[type="checkbox"][required], label:has-text("guardian") input',
      )
      .first()
      .check();

    // Submit.
    await nannyPage.getByRole("button", { name: /^add child/i }).click();

    // Sheet pivots to "Share with the parent" — capture the URL from the
    // readonly Input.
    const shareUrlInput = nannyPage.locator(
      'input[readonly][value*="/invite/"]',
    );
    await expect(shareUrlInput).toBeVisible({ timeout: 15_000 });
    const inviteUrl = await shareUrlInput.inputValue();
    expect(inviteUrl).toMatch(/\/invite\/[A-HJKMN-Z2-9]{4}-[A-HJKMN-Z2-9]{4}$/);
    const token = inviteUrl.split("/invite/").pop()!;

    await nannyContext.close();

    // ── 4-6. Parent claims via the invite URL.
    const parentContext = await signInAs(browser, parent, baseURL!);
    const parentPage = await parentContext.newPage();
    await parentPage.goto(`/invite/${token}`);

    // ready_to_connect state — Connect + Decline buttons.
    const connectButton = parentPage.getByRole("button", {
      name: /^connect$/i,
    });
    await expect(connectButton).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      parentPage.waitForURL(/\/parent\/development\/[\w-]+/, {
        timeout: 15_000,
      }),
      connectButton.click(),
    ]);

    expect(parentPage.url()).toMatch(/\/parent\/development\/[\w-]+/);
    const childId = parentPage.url().split("/development/").pop()!;
    await parentContext.close();

    // ── 7. DB sanity checks.
    const { data: childRow } = await admin
      .from("child_client")
      .select("nanny_user_id, parent_user_id, first_name")
      .eq("id", childId)
      .maybeSingle();

    expect(childRow).toBeTruthy();
    expect(childRow!.nanny_user_id).toBe(nanny.userId);
    expect(childRow!.parent_user_id).toBe(parent.userId);
    expect(childRow!.first_name).toBe(childFirstName);

    const { data: inviteRow } = await admin
      .from("child_invites")
      .select("status")
      .eq("token", token)
      .maybeSingle();

    // recipient_user_id is only stamped on signup-via-invite. A
    // logged-in parent who claims directly via Connect goes straight to
    // status='connected' — the parent's identity lives in
    // child_client.parent_user_id (asserted above), not on the invite.
    expect(inviteRow?.status).toBe("connected");

    const { data: placementRow } = await admin
      .from("nanny_placements")
      .select("status, source")
      .eq(
        "nanny_id",
        (
          await admin
            .from("nannies")
            .select("id")
            .eq("user_id", nanny.userId)
            .single()
        ).data!.id,
      )
      .maybeSingle();

    expect(placementRow?.status).toBe("active");
    expect(placementRow?.source).toBe("invite_link");
  });
});
