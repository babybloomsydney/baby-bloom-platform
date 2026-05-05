/**
 * Sign-in helper for authenticated Playwright tests.
 *
 * Drives the existing /login form rather than constructing the auth
 * cookie manually — keeps the test's auth path identical to the real
 * user's experience and catches form-level regressions in the same run.
 *
 * Usage:
 *   const context = await signInAs(browser, user);
 *   const page = await context.newPage();
 *   await page.goto("/nanny");
 */

import { type Browser, type BrowserContext, expect } from "@playwright/test";
import type { TestUser } from "./auth";

export async function signInAs(
  browser: Browser,
  user: TestUser,
  baseURL: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // `networkidle` ensures the React app has finished hydrating before
  // we click. Without this the submit can fire before the JS onSubmit
  // handler is attached, falling through to a default GET form post.
  await page.goto("/login", { waitUntil: "networkidle" });

  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);

  // Press Enter on the password field — this triggers the form's
  // onSubmit (handled by react-hook-form). Belt-and-braces over
  // clicking the submit button, since react-hook-form's handler
  // intercepts both pathways once hydrated.
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    }),
    page.locator('input[name="password"]').press("Enter"),
  ]);

  // Sanity assertion — we're authenticated, on a role page or wherever
  // the redirect chain landed.
  expect(page.url()).not.toContain("/login");

  await page.close();
  return context;
}
