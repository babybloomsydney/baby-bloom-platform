/**
 * Cron endpoint — fires due proactive_schedules rows every 15 minutes.
 *
 * Called by Vercel Cron via vercel.json.
 * Also callable manually during development:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/proactive
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDueSchedules } from "@/lib/chat/proactive/dispatcher";
import { PROACTIVE_ENABLED } from "@/lib/chat/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!PROACTIVE_ENABLED) {
    return NextResponse.json({
      ok: true,
      skipped: "PROACTIVE_ENABLED flag is off",
      results: [],
    });
  }

  const admin = createAdminClient();
  const startedAt = Date.now();
  const results = await runDueSchedules(admin);
  const durationMs = Date.now() - startedAt;

  const fired = results.filter((r) => r.status === "fired").length;
  const skippedWaking = results.filter(
    (r) => r.status === "skipped_waking",
  ).length;
  // WU 14 — count of AI cron rows skipped because the bot's user has
  // no connected child_client. Every increment is a Gemini call we
  // didn't make.
  const skippedNoChild = results.filter(
    (r) => r.status === "skipped_no_child",
  ).length;
  const errored = results.filter((r) => r.status === "error").length;

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event: "katie.cron.proactive",
      considered: results.length,
      fired,
      skipped_waking: skippedWaking,
      skipped_no_child: skippedNoChild,
      errored,
      duration_ms: durationMs,
    }),
  );

  return NextResponse.json({
    ok: true,
    considered: results.length,
    fired,
    skipped_waking: skippedWaking,
    skipped_no_child: skippedNoChild,
    errored,
    duration_ms: durationMs,
    results,
  });
}
