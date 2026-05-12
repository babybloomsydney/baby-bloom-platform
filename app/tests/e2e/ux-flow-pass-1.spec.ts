/**
 * UX flow pass 1 — pure observation.
 *
 * NOT a regression-style test suite. This is a journey walk that
 * captures DB + UI + DOM at every beat for later narrative analysis.
 * Assertions are minimal — we don't fail on observations; we record
 * them.
 *
 * Plan: system/OPERATIONS/ACTIVE/T-001-payments-build/UX-FLOW-TEST-PLAN.md
 * Diagrams: system/OPERATIONS/ACTIVE/T-001-payments-build/UX-FLOW-DIAGRAMS.md
 *
 * Output: writes per-beat artefacts (PNG + JSON + text) into
 *   tests/e2e/artifacts/ux-flow-pass-1/<beat-id>/
 * which Builder1 then summarises into the prose narrative in
 *   system/OPERATIONS/.../observations/pass-1/<beat-id>.md
 */

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  admin,
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from "./fixtures/auth";
import { signInAs } from "./fixtures/sign-in";

// ─── Configuration ────────────────────────────────────────────────────

const ARTIFACT_ROOT = path.resolve(__dirname, "artifacts", "ux-flow-pass-1");
const FIXTURE_PREFIX = "uxFlow_";

// Each beat has a stable ID so the narrative log can link to its
// artefacts deterministically.
type BeatId =
  | "P1-signed-up"
  | "P2-has-child"
  | "P3-trial-active"
  | "P5-lapsed-trial"
  | "P6-checkout-return"
  | "P7-active-monthly"
  | "P11-cancelled-in-period"
  | "N1-has-unparented-child"
  | "N3-family-in-trial"
  | "N4-family-subscribed"
  | "N9-family-cancelled"
  | "J1-trial-start-cross"
  | "J2-subscribe-cross"
  | "J3-cancel-cross";

// ─── Capture helpers ──────────────────────────────────────────────────

interface BeatArtefacts {
  beatId: BeatId;
  dir: string;
}

async function beginBeat(beatId: BeatId): Promise<BeatArtefacts> {
  const dir = path.join(ARTIFACT_ROOT, beatId);
  await fs.mkdir(dir, { recursive: true });
  return { beatId, dir };
}

/** Layer 1 — DB snapshot for a parent + the joined child + sub row. */
async function captureDbForParent(
  beat: BeatArtefacts,
  label: string,
  parentUserId: string,
): Promise<void> {
  const [sub, children, payouts, activity] = await Promise.all([
    admin
      .from("parent_subscriptions")
      .select("*")
      .eq("parent_user_id", parentUserId)
      .maybeSingle(),
    admin
      .from("child_client")
      .select("id, first_name, parent_user_id, nanny_user_id")
      .eq("parent_user_id", parentUserId),
    admin
      .from("nanny_payouts")
      .select(
        "id, parent_user_id, nanny_user_id, status, amount_aud_cents, paid_at",
      )
      .eq("parent_user_id", parentUserId),
    admin
      .from("activity_logs")
      .select("action_type, action_details, created_at")
      .eq("user_id", parentUserId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const payload = {
    parentUserId,
    parent_subscriptions: sub.data ?? null,
    children: children.data ?? [],
    nanny_payouts: payouts.data ?? [],
    activity_logs: activity.data ?? [],
  };
  await fs.writeFile(
    path.join(beat.dir, `db-parent-${label}.json`),
    JSON.stringify(payload, null, 2),
  );
}

async function captureDbForNanny(
  beat: BeatArtefacts,
  label: string,
  nannyUserId: string,
): Promise<void> {
  const [children, payouts, commission] = await Promise.all([
    admin
      .from("child_client")
      .select("id, first_name, parent_user_id, nanny_user_id")
      .eq("nanny_user_id", nannyUserId),
    admin
      .from("nanny_payouts")
      .select("id, parent_user_id, status, amount_aud_cents, paid_at")
      .eq("nanny_user_id", nannyUserId),
    admin
      .from("commission_rows")
      .select(
        "id, parent_user_id, status, scheduled_release_at, amount_aud_cents",
      )
      .eq("nanny_user_id", nannyUserId)
      .order("scheduled_release_at", { ascending: false })
      .limit(10),
  ]);
  const payload = {
    nannyUserId,
    children: children.data ?? [],
    nanny_payouts: payouts.data ?? [],
    commission_rows: commission.data ?? [],
  };
  await fs.writeFile(
    path.join(beat.dir, `db-nanny-${label}.json`),
    JSON.stringify(payload, null, 2),
  );
}

/** Layer 3 — full page snapshot for a route, plus structured DOM dump. */
async function captureRoute(
  beat: BeatArtefacts,
  page: Page,
  label: string,
  url: string,
): Promise<{ status: number | null; finalUrl: string }> {
  const response = await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500); // settle hydration
  const status = response?.status() ?? null;
  const finalUrl = page.url();

  // Full-page screenshot.
  await page.screenshot({
    path: path.join(beat.dir, `screen-${label}.png`),
    fullPage: true,
  });

  // DOM observation dump — what would a user actually see?
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
      h2: all("h2"),
      headings: all("h1, h2, h3"),
      alerts: all('[role="alert"]'),
      buttons: all("button"),
      links: Array.from(document.querySelectorAll("a")).map((a) => ({
        text: text(a),
        href: a.getAttribute("href"),
      })),
      banners: all('[data-banner], [data-testid*="banner" i]'),
      forms: Array.from(document.querySelectorAll("form")).map((f) => ({
        labels: Array.from(f.querySelectorAll("label")).map((l) =>
          (l.textContent || "").trim(),
        ),
        inputs: Array.from(f.querySelectorAll("input")).map((i) => ({
          name: i.getAttribute("name"),
          type: i.getAttribute("type"),
          placeholder: i.getAttribute("placeholder"),
        })),
      })),
      visibleBodyText: text(document.body)?.slice(0, 4000),
    };
  });

  await fs.writeFile(
    path.join(beat.dir, `dom-${label}.json`),
    JSON.stringify({ url, finalUrl, status, observe }, null, 2),
  );

  return { status, finalUrl };
}

// ─── State helpers ────────────────────────────────────────────────────

interface SetupResult {
  parent: TestUser;
  nanny: TestUser;
  childId: string;
}

/** Seed parent + nanny + a connecting child. Trial NOT auto-started. */
async function seedConnectedPair(suffix: string): Promise<SetupResult> {
  const stamp = Date.now();
  const [parent, nanny] = await Promise.all([
    createTestUser("parent", `${suffix}_parent_${stamp}`),
    createTestUser("nanny", `${suffix}_nanny_${stamp}`),
  ]);
  const { data: child, error } = await admin
    .from("child_client")
    .insert({
      first_name: "Test",
      date_of_birth: "2024-01-15",
      parent_user_id: parent.userId,
      nanny_user_id: nanny.userId,
    })
    .select("id")
    .single();
  if (error || !child) {
    throw new Error(`seed child_client failed: ${error?.message}`);
  }
  return { parent, nanny, childId: child.id };
}

/** Force a parent into a specific subscription state by direct DB write. */
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
  },
): Promise<void> {
  // Upsert so we work whether or not a row exists.
  const { error } = await admin.from("parent_subscriptions").upsert(
    {
      parent_user_id: parentUserId,
      ...state,
    },
    { onConflict: "parent_user_id" },
  );
  if (error) throw new Error(`forceSubscriptionState: ${error.message}`);
}

// ─── Tests (= beats) ──────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("UX Pass 1 — high-value beats", () => {
  let pair: SetupResult;

  test.beforeAll(async () => {
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
    await cleanupTestUsers(FIXTURE_PREFIX);
    pair = await seedConnectedPair(FIXTURE_PREFIX.replace(/_$/, ""));
  });

  test.afterAll(async () => {
    // Best-effort cleanup; pass-2 will reset too.
    await cleanupTestUsers(FIXTURE_PREFIX).catch(() => undefined);
  });

  // ─── P1: signed up, no child (parent only) ──────────────────────────
  // Skip — we seed pair with a child immediately, P1 is a pre-state.

  // ─── P3: trial active (parent just connected) ───────────────────────
  test("P3 — parent trial active", async ({ browser, baseURL }) => {
    const beat = await beginBeat("P3-trial-active");
    const trialEnds = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await forceSubscriptionState(pair.parent.userId, {
      status: "trial",
      trial_ends_at: trialEnds,
      has_used_trial: false,
    });
    await captureDbForParent(beat, "before", pair.parent.userId);

    const ctx = await signInAs(browser, pair.parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${pair.childId}`,
    );
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await ctx.close();

    await captureDbForParent(beat, "after", pair.parent.userId);
  });

  // ─── N3: nanny — family in trial ────────────────────────────────────
  test("N3 — nanny while family in trial", async ({ browser, baseURL }) => {
    const beat = await beginBeat("N3-family-in-trial");
    // state already set in P3
    await captureDbForNanny(beat, "before", pair.nanny.userId);

    const ctx = await signInAs(browser, pair.nanny, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "nanny-hub", "/nanny");
    await captureRoute(
      beat,
      page,
      "nanny-development",
      `/nanny/development/${pair.childId}`,
    );
    await captureRoute(beat, page, "nanny-payouts", "/nanny/payouts");
    await captureRoute(beat, page, "nanny-settings", "/nanny/settings");
    await ctx.close();

    await captureDbForNanny(beat, "after", pair.nanny.userId);
  });

  // ─── P5: lapsed trial ───────────────────────────────────────────────
  test("P5 — parent lapsed (trial expired)", async ({ browser, baseURL }) => {
    const beat = await beginBeat("P5-lapsed-trial");
    await forceSubscriptionState(pair.parent.userId, {
      status: "lapsed",
      trial_ends_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      has_used_trial: true,
    });
    await captureDbForParent(beat, "before", pair.parent.userId);

    const ctx = await signInAs(browser, pair.parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${pair.childId}`,
    );
    await captureRoute(beat, page, "parent-subscribe", "/parent/subscribe");
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await ctx.close();

    await captureDbForParent(beat, "after", pair.parent.userId);
  });

  // ─── N3-LAPSED: nanny view while family is lapsed ───────────────────
  test("N3-LAPSED — nanny while family lapsed", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("N9-family-cancelled");
    await captureDbForNanny(beat, "before", pair.nanny.userId);

    const ctx = await signInAs(browser, pair.nanny, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "nanny-hub", "/nanny");
    await captureRoute(
      beat,
      page,
      "nanny-development",
      `/nanny/development/${pair.childId}`,
    );
    await captureRoute(beat, page, "nanny-payouts", "/nanny/payouts");
    await ctx.close();

    await captureDbForNanny(beat, "after", pair.nanny.userId);
  });

  // ─── P7: active monthly (steady state) ──────────────────────────────
  test("P7 — parent active monthly", async ({ browser, baseURL }) => {
    const beat = await beginBeat("P7-active-monthly");
    const now = new Date();
    const periodEnds = new Date(
      now.getTime() + 25 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await forceSubscriptionState(pair.parent.userId, {
      status: "active_monthly",
      trial_ends_at: new Date(
        now.getTime() - 6 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_starts_at: new Date(
        now.getTime() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_ends_at: periodEnds,
      has_used_trial: true,
    });
    await captureDbForParent(beat, "before", pair.parent.userId);

    const ctx = await signInAs(browser, pair.parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${pair.childId}`,
    );
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await captureRoute(beat, page, "parent-subscribe", "/parent/subscribe");
    await ctx.close();

    await captureDbForParent(beat, "after", pair.parent.userId);
  });

  // ─── N4: nanny — family subscribed ──────────────────────────────────
  test("N4 — nanny while family active_monthly", async ({
    browser,
    baseURL,
  }) => {
    const beat = await beginBeat("N4-family-subscribed");
    await captureDbForNanny(beat, "before", pair.nanny.userId);

    const ctx = await signInAs(browser, pair.nanny, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "nanny-hub", "/nanny");
    await captureRoute(
      beat,
      page,
      "nanny-development",
      `/nanny/development/${pair.childId}`,
    );
    await captureRoute(beat, page, "nanny-payouts", "/nanny/payouts");
    await captureRoute(
      beat,
      page,
      "nanny-payouts-onboarding",
      "/nanny/payouts/onboarding",
    );
    await captureRoute(beat, page, "nanny-settings", "/nanny/settings");
    await ctx.close();

    await captureDbForNanny(beat, "after", pair.nanny.userId);
  });

  // ─── P11: cancelled in period ───────────────────────────────────────
  test("P11 — parent cancelled in period", async ({ browser, baseURL }) => {
    const beat = await beginBeat("P11-cancelled-in-period");
    const now = new Date();
    const periodEnds = new Date(
      now.getTime() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await forceSubscriptionState(pair.parent.userId, {
      status: "cancelled",
      trial_ends_at: new Date(
        now.getTime() - 36 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      paid_period_ends_at: periodEnds,
      cancelled_at: now.toISOString(),
      cancellation_reason: "too_expensive",
      has_used_trial: true,
    });
    await captureDbForParent(beat, "before", pair.parent.userId);

    const ctx = await signInAs(browser, pair.parent, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "parent-hub", "/parent");
    await captureRoute(
      beat,
      page,
      "parent-development",
      `/parent/development/${pair.childId}`,
    );
    await captureRoute(
      beat,
      page,
      "parent-subscription",
      "/parent/subscription",
    );
    await ctx.close();

    await captureDbForParent(beat, "after", pair.parent.userId);
  });

  // ─── N9: nanny — family cancelled ───────────────────────────────────
  test("N9 — nanny while family cancelled", async ({ browser, baseURL }) => {
    const beat = await beginBeat("J3-cancel-cross");
    await captureDbForNanny(beat, "before", pair.nanny.userId);

    const ctx = await signInAs(browser, pair.nanny, baseURL!);
    const page = await ctx.newPage();
    await captureRoute(beat, page, "nanny-hub", "/nanny");
    await captureRoute(beat, page, "nanny-payouts", "/nanny/payouts");
    await ctx.close();

    await captureDbForNanny(beat, "after", pair.nanny.userId);
  });

  // Sanity assertion at the end so the suite reports something useful.
  test("artefacts written", async () => {
    const beats = await fs.readdir(ARTIFACT_ROOT);
    expect(beats.length).toBeGreaterThan(0);
  });
});
