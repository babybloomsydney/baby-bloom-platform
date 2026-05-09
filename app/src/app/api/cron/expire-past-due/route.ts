import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron — expire-past-due
 *
 * Daily. Flips `parent_subscriptions.status` from `past_due` to `lapsed`
 * for every row where `past_due_grace_ends_at < NOW()`. The 7-day past-due
 * grace window is set when `invoice.payment_failed` fires.
 *
 * Spec: `system/APP/PAYMENTS/05-trial-and-access-gates.md` §4.
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
    .eq("status", "past_due")
    .lt("past_due_grace_ends_at", nowIso);

  if (readErr) {
    console.error("[cron:expire-past-due] read failed", readErr);
    return NextResponse.json(
      { error: "read_failed", details: readErr.message },
      { status: 500 },
    );
  }

  let lapsed = 0;
  let skippedTestUsers = 0;

  for (const row of candidates ?? []) {
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
        "[cron:expire-past-due] update failed for",
        row.id,
        updateErr,
      );
      continue;
    }

    await admin.from("activity_logs").insert({
      user_id: row.parent_user_id,
      action_type: "subscription_lapsed",
      action_details: {
        parent_subscription_id: row.id,
        from: "past_due",
        lapsed_at: nowIso,
      },
    });
    lapsed++;
  }

  return NextResponse.json({
    ok: true,
    lapsed,
    skipped_test_users: skippedTestUsers,
  });
}
