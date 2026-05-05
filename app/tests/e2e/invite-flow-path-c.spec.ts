/**
 * Path C end-to-end (authenticated) — switch-confirmation gate.
 *
 * The single-nanny-per-parent invariant + auto-end-on-switch behaviour
 * (CORRECTION-UNIQUE-PLACEMENT-CONSTRAINT.md). When a parent already
 * has an active placement and opens a NEW nanny's invite link, the
 * Connect button stays disabled until they tick the switch-
 * acknowledgement checkbox; on confirm, the previous placement
 * transitions to `ended` and the new one becomes `active`.
 *
 * Setup:
 *   1. Bootstrap: nanny A creates child + parent connects (full Path A).
 *   2. Test: nanny B creates a new child + invite. Same parent opens
 *      that URL → expects switch-confirmation panel.
 *   3. Tick acknowledgement → connect → DB transitions verified.
 */

import { test, expect, type Browser } from "@playwright/test";
import {
  admin,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from "./fixtures/auth";
import { signInAs } from "./fixtures/sign-in";

const INVITES_ENABLED = process.env.PLAYWRIGHT_TEST_INVITES_ENABLED === "true";

test.describe("Path C — switch confirmation (authenticated)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true",
  );

  test.setTimeout(180_000);

  let nannyA: TestUser;
  let nannyB: TestUser;
  let parent: TestUser;

  test.beforeAll(async () => {
    await cleanupTestUsers("pathC_");
    const stamp = Date.now();
    [nannyA, nannyB, parent] = await Promise.all([
      createTestUser("nanny", `pathC_nannyA_${stamp}`),
      createTestUser("nanny", `pathC_nannyB_${stamp}`),
      createTestUser("parent", `pathC_parent_${stamp}`),
    ]);
  });

  test.afterAll(async () => {
    await cleanupTestUsers("pathC_");
  });

  /** Helper: nanny mints + parent claims, returns the connected childId. */
  async function bootstrapConnection(
    browser: Browser,
    baseURL: string,
    nannyUser: TestUser,
    parentUser: TestUser,
    childFirstName: string,
  ): Promise<{ childId: string; token: string }> {
    // Nanny mints.
    const nctx = await signInAs(browser, nannyUser, baseURL);
    const npage = await nctx.newPage();
    await npage.goto("/nanny");
    const tab = npage.getByRole("button", { name: /^education$/i });
    await tab.waitFor({ state: "visible" });
    await tab.click();
    await npage.getByRole("button", { name: /add a child/i }).click();
    await npage.getByRole("button", { name: /add new child/i }).click();
    await npage.getByLabel(/first name/i).fill(childFirstName);
    await npage.getByLabel(/date of birth/i).fill("2024-04-15");
    await npage
      .locator(
        'input[type="checkbox"][required], label:has-text("guardian") input',
      )
      .first()
      .check();
    await npage.getByRole("button", { name: /^add child/i }).click();
    const shareUrl = npage.locator('input[readonly][value*="/invite/"]');
    await expect(shareUrl).toBeVisible({ timeout: 15_000 });
    const inviteUrl = await shareUrl.inputValue();
    const token = inviteUrl.split("/invite/").pop()!;
    await nctx.close();

    // Parent claims.
    const pctx = await signInAs(browser, parentUser, baseURL);
    const ppage = await pctx.newPage();
    await ppage.goto(`/invite/${token}`);
    const connectBtn = ppage.getByRole("button", { name: /^connect$/i });
    await expect(connectBtn).toBeVisible({ timeout: 10_000 });
    await Promise.all([
      ppage.waitForURL(/\/parent\/development\/[\w-]+/, { timeout: 15_000 }),
      connectBtn.click(),
    ]);
    const childId = ppage.url().split("/development/").pop()!;
    await pctx.close();
    return { childId, token };
  }

  test("parent switches from nanny A to nanny B with confirmation gate", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    // ── Bootstrap: parent linked to nanny A.
    const childAName = `OliverE2E${Date.now()}`;
    const { childId: childAId } = await bootstrapConnection(
      browser,
      baseURL!,
      nannyA,
      parent,
      childAName,
    );

    // ── Nanny B mints a new invite for a different child.
    const childBName = `MiaE2E${Date.now()}`;
    let tokenB: string;
    {
      const nctx = await signInAs(browser, nannyB, baseURL!);
      const npage = await nctx.newPage();
      await npage.goto("/nanny");
      const tab = npage.getByRole("button", { name: /^education$/i });
      await tab.waitFor({ state: "visible" });
      await tab.click();
      await npage.getByRole("button", { name: /add a child/i }).click();
      await npage.getByRole("button", { name: /add new child/i }).click();
      await npage.getByLabel(/first name/i).fill(childBName);
      await npage.getByLabel(/date of birth/i).fill("2024-05-20");
      await npage
        .locator(
          'input[type="checkbox"][required], label:has-text("guardian") input',
        )
        .first()
        .check();
      await npage.getByRole("button", { name: /^add child/i }).click();
      const shareUrl = npage.locator('input[readonly][value*="/invite/"]');
      await expect(shareUrl).toBeVisible({ timeout: 15_000 });
      tokenB = (await shareUrl.inputValue()).split("/invite/").pop()!;
      await nctx.close();
    }

    // ── Parent (already linked to A) opens nanny B's invite.
    const pctx = await signInAs(browser, parent, baseURL!);
    const ppage = await pctx.newPage();
    await ppage.goto(`/invite/${tokenB}`);

    // The amber switch-confirmation warning should be visible. Connect
    // button label flips to "Switch to {nannyB.firstName}" — but the
    // fixture nanny's display name comes from user_profiles.first_name,
    // which we set to TEST_FIRST_NAME_TOKEN ("PlaywrightE2E") for all
    // fixture users. So the button reads "Switch to PlaywrightE2E".
    await expect(ppage.getByText(/you're switching nannies/i)).toBeVisible({
      timeout: 10_000,
    });

    const switchButton = ppage.getByRole("button", {
      name: /switch to .+/i,
    });
    await expect(switchButton).toBeDisabled();

    // Tick the acknowledgement.
    await ppage.getByRole("checkbox").check();
    await expect(switchButton).not.toBeDisabled();

    // Connect → expect navigation to the NEW child's development page.
    await Promise.all([
      ppage.waitForURL(/\/parent\/development\/[\w-]+/, { timeout: 15_000 }),
      switchButton.click(),
    ]);

    const childBId = ppage.url().split("/development/").pop()!;
    expect(childBId).not.toBe(childAId);
    await pctx.close();

    // ── DB sanity: parent now has exactly one active placement (the
    // new one), the previous is `ended` with the auto-end note.
    const { data: parentRow } = await admin
      .from("parents")
      .select("id")
      .eq("user_id", parent.userId)
      .single();

    const { data: activeCount } = await admin
      .from("nanny_placements")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", parentRow!.id)
      .eq("status", "active");
    void activeCount;

    const { count: liveActive } = await admin
      .from("nanny_placements")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", parentRow!.id)
      .eq("status", "active");
    expect(liveActive).toBe(1);

    const { data: endedPlacements } = await admin
      .from("nanny_placements")
      .select("status, end_reason, end_notes")
      .eq("parent_id", parentRow!.id)
      .eq("status", "ended");
    expect(endedPlacements?.length).toBeGreaterThanOrEqual(1);
    const autoEnded = endedPlacements!.find((p) =>
      (p.end_notes as string | null)?.includes("Auto-ended"),
    );
    expect(autoEnded).toBeTruthy();
  });
});
