import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";

/**
 * `/nanny/payouts/history` — full payout history (S12).
 *
 * Cross-family list, newest scheduled-release first.
 */
export default async function NannyPayoutHistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/nanny/payouts/history");

  const admin = createAdminClient();
  const { data: payouts } = await admin
    .from("nanny_payouts")
    .select(
      "id, parent_user_id, amount_aud_cents, status, paid_at, scheduled_release_at, period_start, period_end",
    )
    .eq("nanny_user_id", user.id)
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

  // Resolve parent names in one batch.
  const parentIds = Array.from(
    new Set((payouts ?? []).map((p) => p.parent_user_id)),
  );
  const { data: profiles } = parentIds.length
    ? await admin
        .from("user_profiles")
        .select("user_id, first_name")
        .in("user_id", parentIds)
        .returns<Array<{ user_id: string; first_name: string | null }>>()
    : { data: [] };
  const nameByParent = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.first_name) nameByParent.set(p.user_id, p.first_name);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/nanny/payouts"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Back to payouts
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Payout history</h1>

      <Card className="mt-6">
        <CardContent className="p-0">
          {!payouts || payouts.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">
              No payouts yet. Earnings appear here once the first 14-day
              safeguard window has cleared.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {payouts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-6 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      A${(p.amount_aud_cents / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {nameByParent.get(p.parent_user_id) ?? "Family"} ·{" "}
                      {formatDate(p.period_start)} → {formatDate(p.period_end)}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {p.status === "paid" && p.paid_at
                      ? `Paid ${formatDate(p.paid_at)}`
                      : `${p.status} · ${formatDate(p.scheduled_release_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
