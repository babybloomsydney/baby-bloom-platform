/**
 * GET /api/nanny/earnings-badge
 *
 * Returns the nanny's cycle-total earnings value for the global header
 * wallet badge — DSS §8 Q2 (Bailey 2026-05-12).
 *
 * Value definition: A$100 × number of `child_client` rows where this
 * user is the nanny and `under_three=true`. This matches the existing
 * loss-aversion engine on `/nanny/payouts` (AccountTotalTile). The
 * value is the "could earn this cycle" frame — visible from the moment
 * the nanny adds her first child, regardless of subscription state.
 *
 * Why client-fetched: DashboardNav is a deep client component already
 * inside KatieShell; threading the value down via props would require
 * touching the entire shell hierarchy. A small fetched endpoint keeps
 * the change scoped.
 *
 * Returns { totalAud: number, familyCount: number } — header renders
 * `totalAud` directly; `familyCount` is incidentally useful but not
 * surfaced per Bailey's "just the A$ value, no out-of-N text" rule.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EARNINGS_PER_FAMILY_AUD = 100;

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("child_client")
    .select("id", { count: "exact", head: true })
    .eq("nanny_user_id", user.id)
    .eq("under_three", true);

  if (error) {
    return NextResponse.json(
      { error: "lookup_failed", message: error.message },
      { status: 500 },
    );
  }

  const familyCount = count ?? 0;
  return NextResponse.json({
    totalAud: familyCount * EARNINGS_PER_FAMILY_AUD,
    familyCount,
  });
}
