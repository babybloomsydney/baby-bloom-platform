import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron — expire-cancelled-subscriptions
 *
 * Daily. Flips `parent_subscriptions.status` from `cancelled` to `lapsed`
 * for every row where `paid_period_ends_at < NOW()`. Cancelled users keep
 * access until their already-paid period elapses.
 *
 * Spec: `system/APP/PAYMENTS/05-trial-and-access-gates.md` §5.
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
    .eq("status", "cancelled")
    .lt("paid_period_ends_at", nowIso);

  if (readErr) {
    console.error("[cron:expire-cancelled] read failed", readErr);
    return NextResponse.json(
      { error: "read_failed", details: readErr.message },
      { status: 500 },
    );
  }

  let lapsed = 0;

  for (const row of candidates ?? []) {
    const { error: updateErr } = await admin
      .from("parent_subscriptions")
      .update({ status: "lapsed" })
      .eq("id", row.id);

    if (updateErr) {
      console.error(
        "[cron:expire-cancelled] update failed for",
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
        from: "cancelled",
        lapsed_at: nowIso,
      },
    });
    lapsed++;
  }

  return NextResponse.json({ ok: true, lapsed });
}
