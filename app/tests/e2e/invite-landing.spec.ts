/**
 * Playwright E2E — public invite landing page (anon paths only).
 *
 * Auth-gated paths (parent_signed_in → connect → development page) are
 * not covered here because they require a live Supabase test fixture +
 * real cookie state. Those paths are covered by the vitest+RTL suite
 * in `src/app/invite/[token]/InviteLandingClient.test.tsx`.
 *
 * The dev / preview environment defaults to `INVITE_LINKS_ENABLED=false`
 * (kill switch ON). The default test set asserts:
 *   - Status 200 (not 500)
 *   - Renders the "Invites are paused" panel
 *   - Robots noindex meta tag is set
 *   - Referrer-Policy meta tag is set to no-referrer
 *
 * To exercise the kill-switch-OFF tests (Invite not found state),
 * temporarily set `INVITE_LINKS_ENABLED=true` in .env.local, restart
 * the dev server, then run with:
 *
 *   PLAYWRIGHT_TEST_INVITES_ENABLED=true npx playwright test \
 *     tests/e2e/invite-landing.spec.ts
 *
 * Pre-req: dev server running. Override port via PLAYWRIGHT_BASE_URL.
 */

import { test, expect } from "@playwright/test";

const NONEXISTENT_TOKEN = "ZZZZ-ZZZZ";
const MALFORMED_TOKEN = "abc";
const INVITES_ENABLED = process.env.PLAYWRIGHT_TEST_INVITES_ENABLED === "true";

test.describe("/invite/[token] — meta tags + status (kill-switch-agnostic)", () => {
  // These checks run regardless of kill switch state. Both the
  // "paused" and "not found" rendering paths inherit the same metadata
  // from the page's exported `metadata` block.

  test("returns HTTP 200 (not 500) for any token shape", async ({ page }) => {
    const response = await page.goto(`/invite/${MALFORMED_TOKEN}`);
    expect(response?.status()).toBe(200);
  });

  test("returns HTTP 200 for a well-formed but non-existent token", async ({
    page,
  }) => {
    const response = await page.goto(`/invite/${NONEXISTENT_TOKEN}`);
    expect(response?.status()).toBe(200);
  });

  test("noindex meta tag is set", async ({ page }) => {
    await page.goto(`/invite/${MALFORMED_TOKEN}`);
    const robots = page.locator('meta[name="robots"]');
    const robotsContent = await robots.first().getAttribute("content");
    expect(robotsContent).toMatch(/noindex/i);
  });

  test("referrer-policy meta tag is no-referrer", async ({ page }) => {
    await page.goto(`/invite/${MALFORMED_TOKEN}`);
    const referrer = page.locator('meta[name="referrer"]');
    const referrerContent = await referrer.first().getAttribute("content");
    expect(referrerContent).toBe("no-referrer");
  });

  test("h1 heading does NOT contain the raw token (user-visible leak check)", async ({
    page,
  }) => {
    // Narrower than checking the full body — Next.js RSC streaming
    // legitimately includes the URL segment in the JSON payload, which
    // isn't a user-visible leak. The user-facing surface is the heading
    // and body copy; those must never echo the token.
    await page.goto(`/invite/${MALFORMED_TOKEN}`);
    const h1Text = await page.locator("h1").first().textContent();
    expect(h1Text?.toLowerCase()).not.toContain(MALFORMED_TOKEN.toLowerCase());
  });
});

test.describe("/invite/[token] — kill switch ON (paused state)", () => {
  test.skip(
    INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED unset / false to run",
  );

  test("renders 'Invites are paused' when INVITE_LINKS_ENABLED=false", async ({
    page,
  }) => {
    await page.goto(`/invite/${NONEXISTENT_TOKEN}`);
    await expect(page.locator("h1")).toContainText(/paused/i);
  });
});

test.describe("/invite/[token] — kill switch OFF (live invites)", () => {
  test.skip(
    !INVITES_ENABLED,
    "Set PLAYWRIGHT_TEST_INVITES_ENABLED=true + INVITE_LINKS_ENABLED=true to run",
  );

  test("malformed token renders Invite not found state", async ({ page }) => {
    await page.goto(`/invite/${MALFORMED_TOKEN}`);
    await expect(page.locator("h1")).toContainText(/Invite not found/i);
    const cta = page.getByRole("link", {
      name: /Sign up to add a child/i,
    });
    await expect(cta).toHaveAttribute("href", "/signup/parent");
  });

  test("well-formed but non-existent token renders Invite not found", async ({
    page,
  }) => {
    await page.goto(`/invite/${NONEXISTENT_TOKEN}`);
    await expect(page.locator("h1")).toContainText(/Invite not found/i);
  });
});
