import { test, expect } from '@playwright/test';

/**
 * Smoke test for Playwright runner — does not hit localhost.
 * Real E2E tests live alongside features as they're built.
 */
test('playwright runner works', async ({ page }) => {
  await page.setContent('<h1>katie smoke</h1>');
  await expect(page.locator('h1')).toHaveText('katie smoke');
});
