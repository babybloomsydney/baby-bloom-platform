/**
 * Schedule regression test — locks down the daily 7am-Sydney cron
 * registration in `vercel.json`. Bailey 2026-05-14: payouts must
 * actually fire once a day. Without this test, someone re-ordering
 * vercel.json could silently drop the entry.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface VercelCron {
  path: string;
  schedule: string;
}

function readVercelCrons(): VercelCron[] {
  const path = join(process.cwd(), "vercel.json");
  const json = JSON.parse(readFileSync(path, "utf8"));
  return json.crons as VercelCron[];
}

describe("vercel.json — release-payouts cron registration", () => {
  it("registers the release-payouts cron path", () => {
    const crons = readVercelCrons();
    const target = crons.find((c) => c.path === "/api/cron/release-payouts");
    expect(target).toBeDefined();
  });

  it("runs once daily — not hourly or more often", () => {
    const crons = readVercelCrons();
    const target = crons.find((c) => c.path === "/api/cron/release-payouts");
    if (!target) throw new Error("cron entry missing");
    // Vercel cron syntax: `minute hour day-of-month month day-of-week`.
    // A daily-once schedule must have specific minute + specific hour.
    const [minute, hour] = target.schedule.split(" ");
    expect(minute).not.toContain("*");
    expect(minute).not.toContain("/");
    expect(hour).not.toContain("*");
    expect(hour).not.toContain("/");
  });

  it("fires at 21:00 UTC = 07:00 AEST (or 08:00 AEDT under Sydney DST)", () => {
    const crons = readVercelCrons();
    const target = crons.find((c) => c.path === "/api/cron/release-payouts");
    if (!target) throw new Error("cron entry missing");
    expect(target.schedule).toBe("0 21 * * *");
  });
});
