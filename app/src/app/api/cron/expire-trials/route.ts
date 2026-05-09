import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron — expire-trials
 *
 * Daily 03:00 UTC. Flips `parent_subscriptions.status` from `trial` to
 * `lapsed` for every row where `trial_ends_at < NOW()`. Test users are
 * skipped (their is_test_user flag overrides access via family_has_access()).
 *
 * Spec: `system/APP/PAYMENTS/05-trial-and-access-gates.md` §3.
 *
 * Returns: { expired: number, skipped_test_users: number }.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: candidates, error: readErr } = await admin
    .from("parent_subscriptions")
    .select("id, parent_user_id")
    .eq("status", "trial")
    .lt("trial_ends_at", nowIso);

  if (readErr) {
    console.error("[cron:expire-trials] read failed", readErr);
    return NextResponse.json(
      { error: "read_failed", details: readErr.message },
      { status: 500 },
    );
  }

  let expired = 0;
  let skippedTestUsers = 0;

  for (const row of candidates ?? []) {
    // Test-user bypass — never lapse a test user. Belt-and-braces:
    // family_has_access() also short-circuits, but flipping their
    // status would still pollute funnel analytics.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_test_user")
      .eq("user_id", row.parent_user_id)
      .maybeSingle<{ is_test_user: boolean | null }>();

    if (profile?.is_test_user) {
      skippedTestUsers++;
      continue;
    }

    const { error: updateErr } = await admin
      .from("parent_subscriptions")
      .update({ status: "lapsed" })
      .eq("id", row.id);

    if (updateErr) {
      console.error(
        "[cron:expire-trials] update failed for",
        row.id,
        updateErr,
      );
      continue;
    }

    await admin.from("activity_logs").insert({
      user_id: row.parent_user_id,
      action_type: "trial_lapsed",
      action_details: { parent_subscription_id: row.id, expired_at: nowIso },
    });
    expired++;
  }

  return NextResponse.json({
    ok: true,
    expired,
    skipped_test_users: skippedTestUsers,
  });
}
