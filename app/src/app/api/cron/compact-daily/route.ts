/**
 * Cron endpoint — summarises each bot's chat_messages for yesterday
 * into a chat_summaries row.
 *
 * Scheduled daily (see vercel.json). Targets the previous calendar day
 * in the caller's timezone so late-evening messages don't get cut off.
 *
 * Manual run during development:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/cron/compact-daily
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     'http://localhost:3000/api/cron/compact-daily?date=2026-04-22'
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compactDailyAllBots } from "@/lib/chat/memory/compaction";
import { KATIE_ENABLED } from "@/lib/chat/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function yesterdayIso(timezone = "Australia/Sydney"): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(yesterday); // "YYYY-MM-DD"
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!KATIE_ENABLED) {
    return NextResponse.json({
      ok: true,
      skipped: "KATIE_ENABLED flag is off",
      results: [],
    });
  }

  const url = new URL(request.url);
  const dateIso = url.searchParams.get("date") ?? yesterdayIso();

  const admin = createAdminClient();
  const startedAt = Date.now();
  const results = await compactDailyAllBots(admin, dateIso);
  const durationMs = Date.now() - startedAt;

  const written = results.filter((r) => r.status === "written").length;
  const skipped = results.filter(
    (r) => r.status === "skipped_no_messages",
  ).length;
  const errored = results.filter((r) => r.status === "error").length;

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "katie.cron.compact_daily",
      date: dateIso,
      considered: results.length,
      written,
      skipped,
      errored,
      duration_ms: durationMs,
    }),
  );

  return NextResponse.json({
    ok: true,
    date: dateIso,
    considered: results.length,
    written,
    skipped,
    errored,
    duration_ms: durationMs,
    results,
  });
}
