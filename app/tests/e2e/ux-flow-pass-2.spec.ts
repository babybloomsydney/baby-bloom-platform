/**
 * UX flow pass 2 — theory testing + deferred beats from pass 1.
 *
 * Adds:
 *   - Real Stripe Checkout drive-through (P6 — the "money moment")
 *   - Past-due state + banner check (P8)
 *   - /parent/subscription/cancel page (P11.cancel form, vs portal-based)
 *   - Katie chat API response for a parent without subscription (verifies
 *     the Katie-blind theory from prior code-level audit)
 *   - Mobile viewport pass on the same beats from pass 1
 *
 * Output: tests/e2e/artifacts/ux-flow-pass-2/<beat>/
 */

import { test, expect, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  admin,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from "./fixtures/auth";
import { signInAs } from "./fixtures/sign-in";

const ARTIFACT_ROOT = path.resolve(__dirname, "artifacts", "ux-flow-pass-2");
const FIXTURE_PREFIX = "uxFlow2_";

type BeatId =
  | "P6-checkout-real"
  | "P8-past-due"
  | "P11-cancel-page"
  | "Katie-blind-parent"
  | "Katie-blind-parent-active"
  | "mobile-P3"
  | "mobile-P5"
  | "mobile-P7";

async function beginBeat(beatId: BeatId) {
  const dir = path.join(ARTIFACT_ROOT, beatId);
  await fs.mkdir(dir, { recursive: true });
  return { beatId, dir };
}

async function captureRoute(
  beat: { dir: string },
  page: Page,
  label: string,
  url: string,
) {
  const response = await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(beat.dir, `screen-${label}.png`),
    fullPage: true,
  });
  const observe = await page.evaluate(() => {
    const text = (el: Element | null) =>
      el ? (el.textContent || "").trim().replace(/\s+/g, " ") : null;
    const all = (sel: string) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => text(el))
        .filter(Boolean);
    return {
      title: document.title,
      h1: text(document.querySelector("h1")),
      headings: all("h1, h2, h3"),
      alerts: all('[role="alert"]'),
      buttons: all("button"),
      links: Array.from(document.querySelectorAll("a")).map((a) => ({
        text: text(a),
        href: a.getAttribute("href"),
      })),
      visibleBodyText: text(document.body)?.slice(0, 4000),
    };
  });
  await fs.writeFile(
    path.join(beat.dir, `dom-${label}.json`),
    JSON.stringify(
      {
        url,
        finalUrl: page.url(),
        status: response?.status() ?? null,
        observe,
      },
      null,
      2,
    ),
  );
}

async function forceSubscriptionState(
  parentUserId: string,
  state: {
    status:
      | "trial"
      | "active_monthly"
      | "active_upfront"
      | "past_due"
      | "cancelled"
      | "lapsed";
    trial_ends_at?: string | null;
    paid_period_starts_at?: string | null;
    paid_period_ends_at?: string | null;
    has_used_trial?: boolean;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    past_due_grace_ends_at?: string | null;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  },
) {
  const { error } = await admin
    .from("parent_subscriptions")
    .upsert(
      { parent_user_id: parentUserId, ...state },
      { onConflict: "parent_user_id" },
    );
  if (error) throw new Error(`forceSubscriptionState: ${error.message}`);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.describe("UX Pass 2 — deferred beats + theory tests", () => {
  let parent: TestUser;
  let nanny: TestUser;
  let childId: string;

  test.beforeAll(async () => {
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
    await cleanupTestUsers(FIXTURE_PREFIX);
    const stamp = Date.now();
    [parent, nanny] = await Promise.all([
      createTestUser(
        "parent",
        `${FIXTURE_PREFIX.replace(/_$/, "")}_parent_${stamp}`,
      ),
      createTestUser(
        "nanny",
        `${FIXTURE_PREFIX.replace(/_$/, "")}_nanny_${stamp}`,
      ),
    ]);
    const { data: child, error } = await admin
      .from("child_client")
      .insert({
        first_name: "Test",
        date_of_birth: "2024-01-15",
        parent_user_id: parent.userId,
        nanny_user_id: nanny.userId,
        // `under_three` defaults to false at the DB level + is set
        // to true by every real signup path. Without this flag the
        // child is excluded by Katie's children-enumeration query
        // and by the parent/nanny hub educationChildren filter,
        // producing the same false-negative we saw in pass-1.
        under_three: true,
        onboarded: true,
        status: "created_manual",
      })
      .select("id")
      .single();
    if (error || !child) {
      throw new Error(`seed child failed: ${error?.message}`);
    }
    childId = child.id;
  });

  test.afterAll(async () => {
    await cleanupTestUsers(FIXTURE_PREFIX).catch(() => undefined);
  });

  // ─── P8: past-due ───────────────────────────────────────────────────
  test("P8 — parent past_due (in grace)", async ({ browser, baseURL }) => {
    const beat = await beginBeat("P8-past-due");
    await forceSubscriptionState(parent.userId, {
      status: "past_due",
      paid_period_starts_at: new Date(
        Date.now() - 25 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_ends_at: new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      past_due_grace_ends_at: new Date(
        Date.now() + 6 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      has_used_trial: true,
    });

    const ctx = await signInAs(browser, parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${childId}`,
    );
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await ctx.close();
  });

  // ─── P11.cancel: parent subscription cancel page ───────────────────
  test("P11.cancel — /parent/subscription/cancel form", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("P11-cancel-page");
    await forceSubscriptionState(parent.userId, {
      status: "active_monthly",
      paid_period_starts_at: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_ends_at: new Date(
        Date.now() + 25 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      stripe_subscription_id: "sub_FAKE_xxx", // so cancel page renders
      has_used_trial: true,
    });

    const ctx = await signInAs(browser, parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(
      beat,
      page,
      "cancel-page",
      "/parent/subscription/cancel",
    );
    await ctx.close();
  });

  // ─── Katie blind test — parent without sub asks about child ────────
  test("Katie-blind-parent — parent in lapsed state asks Katie about child", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("Katie-blind-parent");
    await forceSubscriptionState(parent.userId, {
      status: "lapsed",
      trial_ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      has_used_trial: true,
    });

    // Sign in and use the session cookies to call the chat API
    const ctx = await signInAs(browser, parent, baseURL!);
    const page = await ctx.newPage();
    const cookies = await ctx.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Send "tell me about my child Test" to chat API
    const response = await page.request.post(`${baseURL}/api/chat`, {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      data: {
        message: "Tell me about my child Test",
      },
      timeout: 30000,
    });
    const status = response.status();
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "<could not read body>";
    }
    await fs.writeFile(
      path.join(beat.dir, "chat-response.json"),
      JSON.stringify(
        {
          status,
          headers: response.headers(),
          body: body.slice(0, 5000),
        },
        null,
        2,
      ),
    );

    // Also capture what the Katie deck UI shows
    await captureRoute(beat, page, "parent-hub-with-katie", "/parent");
    await ctx.close();
  });

  // ─── Katie test in active subscribed state ─────────────────────────
  test("Katie-blind-parent-active — parent active_monthly asks Katie about child", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("Katie-blind-parent-active");
    await forceSubscriptionState(parent.userId, {
      status: "active_monthly",
      paid_period_starts_at: new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_ends_at: new Date(
        Date.now() + 25 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      has_used_trial: true,
    });

    const ctx = await signInAs(browser, parent, baseURL!);
    const page = await ctx.newPage();
    const cookies = await ctx.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await page.request.post(`${baseURL}/api/chat`, {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      data: {
        message: "Tell me about my child Test",
      },
      timeout: 30000,
    });
    const status = response.status();
    const body = await response.text().catch(() => "<unreadable>");
    await fs.writeFile(
      path.join(beat.dir, "chat-response.json"),
      JSON.stringify({ status, body: body.slice(0, 5000) }, null, 2),
    );
    await ctx.close();
  });

  // ─── P6: real Stripe Checkout drive-through ─────────────────────────
  // This one is flaky. Wrap defensively + capture whatever lands.
  test("P6 — real Stripe Checkout drive-through", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("P6-checkout-real");
    await forceSubscriptionState(parent.userId, {
      status: "lapsed",
      trial_ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      has_used_trial: true,
    });

    const ctx = await signInAs(browser, parent, baseURL!);
    const page = await ctx.newPage();

    // Step 1 — navigate to /parent/subscribe
    await captureRoute(beat, page, "before-subscribe", "/parent/subscribe");

    // Step 2 — click "Subscribe monthly"
    try {
      await page
        .getByRole("button", { name: /Subscribe monthly/i })
        .click({ timeout: 15_000 });
      // Step 3 — wait for Stripe Checkout to load
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      await page.waitForTimeout(3_000); // let iframe load
      await page.screenshot({
        path: path.join(beat.dir, "screen-stripe-checkout-loaded.png"),
        fullPage: true,
      });

      // Step 4 — fill the card. Stripe Checkout iframe selectors are
      // unstable, so we use Playwright's built-in fillCheckout helpers
      // OR fall through to "captured the loaded page only".
      try {
        const emailField = page.getByLabel(/email/i);
        if (await emailField.count()) {
          await emailField.fill(parent.email);
        }
        const cardField = page.getByPlaceholder(/card number/i).first();
        if (await cardField.count()) {
          await cardField.fill("4242 4242 4242 4242");
        }
        const expField = page.getByPlaceholder(/MM \/ YY|expir/i).first();
        if (await expField.count()) {
          await expField.fill("12 / 30");
        }
        const cvcField = page.getByPlaceholder(/cvc/i).first();
        if (await cvcField.count()) {
          await cvcField.fill("123");
        }
        const nameField = page
          .getByPlaceholder(/name on card|cardholder/i)
          .first();
        if (await nameField.count()) {
          await nameField.fill("Test User");
        }
        await page.screenshot({
          path: path.join(beat.dir, "screen-stripe-checkout-filled.png"),
          fullPage: true,
        });

        // Submit
        await page
          .getByRole("button", { name: /Subscribe|Pay/i })
          .first()
          .click({ timeout: 15_000 });

        // Step 5 — wait for redirect back to localhost
        await page.waitForURL(/localhost.*parent.*subscription/, {
          timeout: 60_000,
        });
        await page.waitForTimeout(2_000);
        await page.screenshot({
          path: path.join(beat.dir, "screen-after-return-immediate.png"),
          fullPage: true,
        });
        const observeImmediate = await page.evaluate(() => ({
          url: window.location.href,
          h1: document.querySelector("h1")?.textContent?.trim(),
          body: document.body.textContent?.slice(0, 2000),
        }));
        await fs.writeFile(
          path.join(beat.dir, "dom-after-return-immediate.json"),
          JSON.stringify(observeImmediate, null, 2),
        );

        // Step 6 — wait 4s for webhook to land + refresh
        await page.waitForTimeout(4_000);
        await page.reload({ waitUntil: "networkidle" });
        await page.screenshot({
          path: path.join(beat.dir, "screen-after-return-refreshed.png"),
          fullPage: true,
        });
        const observeRefreshed = await page.evaluate(() => ({
          url: window.location.href,
          h1: document.querySelector("h1")?.textContent?.trim(),
          body: document.body.textContent?.slice(0, 2000),
        }));
        await fs.writeFile(
          path.join(beat.dir, "dom-after-return-refreshed.json"),
          JSON.stringify(observeRefreshed, null, 2),
        );
      } catch (innerErr) {
        await fs.writeFile(
          path.join(beat.dir, "stripe-iframe-failure.txt"),
          `Stripe iframe interaction failed: ${(innerErr as Error).message}`,
        );
      }
    } catch (err) {
      await fs.writeFile(
        path.join(beat.dir, "subscribe-click-failure.txt"),
        `Could not initiate Checkout: ${(err as Error).message}`,
      );
    }
    await ctx.close();
  });

  // ─── Mobile viewport — repeat P3 + P5 + P7 ─────────────────────────
  test("mobile — parent trial state on iPhone viewport", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("mobile-P3");
    await forceSubscriptionState(parent.userId, {
      status: "trial",
      trial_ends_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      has_used_trial: false,
    });
    const ctx = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    // Sign in via the existing helper (uses a desktop ctx; re-create
    // session by repeating sign-in on this mobile context).
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(parent.email);
    await page.locator('input[name="password"]').fill(parent.password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), {
        timeout: 15_000,
      }),
      page.locator('input[name="password"]').press("Enter"),
    ]);
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${childId}`,
    );
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await ctx.close();
  });

  test("mobile — parent lapsed on iPhone viewport", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("mobile-P5");
    await forceSubscriptionState(parent.userId, {
      status: "lapsed",
      trial_ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      has_used_trial: true,
    });
    const ctx = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator('input[name="email"]').fill(parent.email);
    await page.locator('input[name="password"]').fill(parent.password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), {
        timeout: 15_000,
      }),
      page.locator('input[name="password"]').press("Enter"),
    ]);
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${childId}`,
    );
    await captureRoute(beat, page, "parent-subscribe", "/parent/subscribe");
    await ctx.close();
  });

  test("artefacts sanity", async () => {
    const beats = await fs.readdir(ARTIFACT_ROOT);
    expect(beats.length).toBeGreaterThan(0);
  });
});
