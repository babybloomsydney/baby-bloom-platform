/**
 * Server-side payout history fetch — used by both the standalone
 * `/nanny/payouts/history` page and the "Payout History" leaf inside
 * settings. Single query for `nanny_payouts` cross-family, sorted
 * by scheduled release desc; resolves parent names in one batched
 * lookup.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface PayoutHistoryRow {
  id: string;
  parentFirstName: string;
  amountAudCents: number;
  status: string;
  paidAt: string | null;
  scheduledReleaseAt: string;
  periodStart: string;
  periodEnd: string;
}

export async function fetchPayoutHistory(
  nannyUserId: string,
): Promise<PayoutHistoryRow[] | null> {
  const admin = createAdminClient();
  const { data: payouts, error: payoutsErr } = await admin
    .from("nanny_payouts")
    .select(
      "id, parent_user_id, amount_aud_cents, status, paid_at, scheduled_release_at, period_start, period_end",
    )
    .eq("nanny_user_id", nannyUserId)
    .order("scheduled_release_at", { ascending: false })
    .limit(100)
    .returns<
      Array<{
        id: string;
        parent_user_id: string;
        amount_aud_cents: number;
        status: string;
        paid_at: string | null;
        scheduled_release_at: string;
        period_start: string;
        period_end: string;
      }>
    >();
  if (payoutsErr) return null;

  const parentIds = Array.from(
    new Set((payouts ?? []).map((p) => p.parent_user_id)),
  );
  const { data: profiles } = parentIds.length
    ? await admin
        .from("user_profiles")
        .select("user_id, first_name")
        .in("user_id", parentIds)
        .returns<Array<{ user_id: string; first_name: string | null }>>()
    : { data: [] as Array<{ user_id: string; first_name: string | null }> };
  const nameByParent = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.first_name) nameByParent.set(p.user_id, p.first_name);
  }

  return (payouts ?? []).map((p) => ({
    id: p.id,
    parentFirstName: nameByParent.get(p.parent_user_id) ?? "Family",
    amountAudCents: p.amount_aud_cents,
    status: p.status,
    paidAt: p.paid_at,
    scheduledReleaseAt: p.scheduled_release_at,
    periodStart: p.period_start,
    periodEnd: p.period_end,
  }));
}
