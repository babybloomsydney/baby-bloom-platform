/**
 * Visual regression baseline — WU 0.8
 *
 * Captures reference screenshots of key public routes at 5 viewports.
 * Run once to establish baselines. Re-run after shell changes (Phase 1C,
 * when Katie Deck integrates into the app layout) to detect regressions.
 *
 * Setup:
 *   - `npm run dev` must be running on http://localhost:3000
 *   - First run creates baselines in `tests/e2e/visual/baseline.spec.ts-snapshots/`
 *   - Subsequent runs compare and report diffs
 *
 * Run all:       `npm run test:e2e -- tests/e2e/visual`
 * Update baseline: `npm run test:e2e -- tests/e2e/visual --update-snapshots`
 */

import { test, expect } from "@playwright/test";

// Public routes only — authenticated routes need auth fixtures (deferred).
// Covers enough surface area to detect any global shell regression.
const ROUTES = [
  { name: "landing", path: "/" },
  { name: "login", path: "/login" },
  { name: "signup-nanny", path: "/signup/nanny" },
  { name: "signup-parent", path: "/signup/parent" },
  { name: "browse", path: "/parent/browse" },
];

// Deterministic waiting — avoid animation / network-dependent pixel jitter.
async function waitForStable(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  // Scroll to bottom + back to top to force lazy images to load
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState("networkidle");
  // Final settle
  await page.waitForTimeout(600);
}

for (const route of ROUTES) {
  test(`baseline: ${route.name}`, async ({ page }, testInfo) => {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    await waitForStable(page);

    // Mask known volatile elements (dates, ticker-style counts) if any appear;
    // add selectors here as needed.
    const snapshotName = `${route.name}.png`;
    await expect(page).toHaveScreenshot(snapshotName, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      // Tolerate minor sub-pixel differences between runs.
      // 5% allows for font antialiasing + minor animation frame differences.
      // A real regression (e.g. layout shift from the Katie shell) will
      // blow past this threshold easily.
      maxDiffPixelRatio: 0.05,
    });
  });
}
