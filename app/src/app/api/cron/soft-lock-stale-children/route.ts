import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron — soft-lock-stale-children
 *
 * Daily. Sets `child_client.feed_locked_for_nanny = TRUE` for every child
 * where: a nanny created the child >= 30 days ago and no parent has
 * connected yet. Test nannies are skipped.
 *
 * Side effect of `connect_child_invite()` (PG fn) clears the lock when
 * a parent connects.
 *
 * Spec: `system/APP/PAYMENTS/02-business-model.md` §5 (soft-lock).
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
  const cutoffIso = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Children created by a nanny, no parent connected yet, older than
  // 30 days, not already locked.
  const { data: candidates, error: readErr } = await admin
    .from("child_client")
    .select("id, nanny_user_id")
    .not("nanny_user_id", "is", null)
    .is("parent_user_id", null)
    .lt("created_at", cutoffIso)
    .eq("feed_locked_for_nanny", false);

  if (readErr) {
    console.error("[cron:soft-lock-stale] read failed", readErr);
    return NextResponse.json(
      { error: "read_failed", details: readErr.message },
      { status: 500 },
    );
  }

  let locked = 0;
  let skippedTestUsers = 0;

  for (const row of candidates ?? []) {
    if (!row.nanny_user_id) continue;

    const { data: profile } = await admin
      .from("user_profiles")
      .select("is_test_user")
      .eq("user_id", row.nanny_user_id)
      .maybeSingle<{ is_test_user: boolean | null }>();

    if (profile?.is_test_user) {
      skippedTestUsers++;
      continue;
    }

    // Use the helper PG fn so the lock + lock-time write atomically.
    const { error: rpcErr } = await admin.rpc("update_soft_lock", {
      p_child_id: row.id,
      p_locked: true,
    });

    if (rpcErr) {
      console.error("[cron:soft-lock-stale] rpc failed for", row.id, rpcErr);
      continue;
    }

    locked++;
  }

  return NextResponse.json({
    ok: true,
    locked,
    skipped_test_users: skippedTestUsers,
  });
}
