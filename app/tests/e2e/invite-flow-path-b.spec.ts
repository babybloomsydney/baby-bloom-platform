/**
 * Path B end-to-end (authenticated) — parent → nanny invite flow.
 *
 * Mirror of Path A: parent creates a child, gets the invite URL,
 * a nanny opens it and connects, both end up linked.
 *
 * Differences from Path A:
 *   - Parent flow has NO disclaimer checkbox (parent IS the legal
 *     guardian).
 *   - Direction = 'parent_to_nanny'.
 *   - Final landing: `/nanny/development/{childId}`.
 *
 * See `invite-flow-path-a.spec.ts` for the preconditions + cleanup
 * pattern.
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

test.describe("Path B — parent → nanny invite (authenticated)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true",
  );

  test.setTimeout(120_000);

  let parent: TestUser;
  let nanny: TestUser;

  test.beforeAll(async () => {
    await cleanupTestUsers("pathB_");
    const stamp = Date.now();
    [parent, nanny] = await Promise.all([
      createTestUser("parent", `pathB_parent_${stamp}`),
      createTestUser("nanny", `pathB_nanny_${stamp}`),
    ]);
  });

  test.afterAll(async () => {
    await cleanupTestUsers("pathB_");
  });

  test("parent creates child → nanny connects → both linked", async ({
    browser,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    // ── Parent mints the invite.
    const parentContext = await signInAs(browser, parent, baseURL!);
    const parentPage = await parentContext.newPage();
    await parentPage.goto("/parent");

    // ParentHubClient's validTabs whitelist excludes "education" so we
    // can't initialise via ?t=. Click the tab button instead — wait for
    // it to be hydrated before clicking.
    const educationTab = parentPage.getByRole("button", {
      name: /^education$/i,
    });
    await educationTab.waitFor({ state: "visible", timeout: 10_000 });
    await educationTab.click();

    await parentPage.getByRole("button", { name: /add a child/i }).click();
    await parentPage.getByRole("button", { name: /add new child/i }).click();

    const childFirstName = `MaxE2E${Date.now()}`;
    await parentPage.getByLabel(/first name/i).fill(childFirstName);
    await parentPage.getByLabel(/date of birth/i).fill("2024-02-20");

    // Parent variant has NO disclaimer + NO post-create share panel.
    // It routes straight to /parent/development/{childId} where the
    // InviteBanner exposes the share URL via the OS share sheet /
    // clipboard. Submit and wait for the redirect.
    await Promise.all([
      parentPage.waitForURL(/\/parent\/development\/[\w-]+/, {
        timeout: 15_000,
      }),
      parentPage.getByRole("button", { name: /^add child/i }).click(),
    ]);

    const childId = parentPage.url().split("/development/").pop()!;
    await parentContext.close();

    // The token isn't surfaced in client-readable DOM (the banner
    // shells it behind navigator.share / clipboard.writeText). Query
    // the DB directly for the freshly-minted invite.
    const { data: minted } = await admin
      .from("child_invites")
      .select("token")
      .eq("child_client_id", childId)
      .eq("status", "pending")
      .single();
    const token = minted!.token;
    expect(token).toMatch(/^[A-HJKMN-Z2-9]{4}-[A-HJKMN-Z2-9]{4}$/);

    // ── Nanny claims via the invite URL.
    const nannyContext = await signInAs(browser, nanny, baseURL!);
    const nannyPage = await nannyContext.newPage();
    await nannyPage.goto(`/invite/${token}`);

    const connectButton = nannyPage.getByRole("button", {
      name: /^connect$/i,
    });
    await expect(connectButton).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      nannyPage.waitForURL(/\/nanny\/development\/[\w-]+/, {
        timeout: 15_000,
      }),
      connectButton.click(),
    ]);

    expect(nannyPage.url()).toMatch(/\/nanny\/development\/[\w-]+/);
    // Sanity: nanny landed on the SAME child the parent created.
    expect(nannyPage.url().split("/development/").pop()!).toBe(childId);
    await nannyContext.close();

    // ── DB sanity.
    const { data: childRow } = await admin
      .from("child_client")
      .select("nanny_user_id, parent_user_id, first_name")
      .eq("id", childId)
      .maybeSingle();
    expect(childRow!.nanny_user_id).toBe(nanny.userId);
    expect(childRow!.parent_user_id).toBe(parent.userId);
    expect(childRow!.first_name).toBe(childFirstName);

    const { data: inviteRow } = await admin
      .from("child_invites")
      .select("status, direction")
      .eq("token", token)
      .maybeSingle();
    expect(inviteRow?.status).toBe("connected");
    expect(inviteRow?.direction).toBe("parent_to_nanny");
  });
});
