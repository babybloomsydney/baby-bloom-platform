/**
 * Cron endpoint — hard-deletes orphaned children whose `orphaned_at`
 * timestamp is older than 365 days. Per spec
 * `06-edge-cases-and-cleanup.md §3.3`. Cascade FKs clean up
 * `child_client_events`, `bapp_logs` rows, and any lingering
 * `child_invites` rows attached to the deleted child.
 *
 * Schedule: daily at 03:00 UTC (vercel.json crons[]).
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — same shape as
 *       /api/cron/proactive and friends.
 * Kill switch: skips entirely when `INVITE_LINKS_ENABLED === 'false'`.
 *
 * Manual trigger during development:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     http://localhost:3000/api/cron/cleanup-orphan-children
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitesDisabled } from "@/lib/invite/flags";
import { orphanCleanupCutoff } from "@/lib/invite/orphan-cleanup";

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

  if (invitesDisabled()) {
    return NextResponse.json({
      ok: true,
      skipped: "invites_disabled",
      deleted: 0,
    });
  }

  const cutoff = orphanCleanupCutoff(new Date());
  const admin = createAdminClient();

  // `.select('id')` returns the deleted rows so we can audit-log how
  // many landed. The DELETE itself uses a partial filter on
  // `orphaned_at` — children that never went orphan have a NULL
  // value and `.lt()` against NULL is FALSE, so they're left alone
  // by construction.
  const { data, error } = await admin
    .from("child_client")
    .delete()
    .lt("orphaned_at", cutoff)
    .select("id");

  if (error) {
    console.error("[cleanup-orphan-children] delete error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const deletedCount = data?.length ?? 0;

  // Audit log. action_type matches the CHECK enum extension from
  // 01-schema.sql step 6b; action_details payload kept compact.
  if (deletedCount > 0) {
    const { error: logError } = await admin.from("activity_logs").insert({
      action_type: "orphan_cleanup_run",
      action_details: {
        deleted_count: deletedCount,
        cutoff,
      },
    });
    if (logError) {
      console.error(
        "[cleanup-orphan-children] activity_logs insert failed (non-fatal):",
        logError,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: deletedCount,
    cutoff,
  });
}
