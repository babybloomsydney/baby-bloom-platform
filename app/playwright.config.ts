import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Katie E2E tests + visual regression baselines.
 * See system/APP/BLOOMBOT/IMPLEMENTATION-PLAN.md WU 0.8 (baseline screenshots).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'tablet',         use: { ...devices['iPad (gen 7)'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile',         use: { ...devices['iPhone 13'],    viewport: { width: 390, height: 844 } } },
  ],
  // Dev server not spun up here — tests that need it should set `webServer` per-suite,
  // or run `npm run dev` separately. Smoke tests avoid hitting localhost.
});
