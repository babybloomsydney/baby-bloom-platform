import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/require-admin";
import { Card, CardContent } from "@/components/ui/card";

/**
 * `/admin/subscriptions` — overview of every parent's subscription
 * state (S18).
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S18.
 *
 * Counters at top + filterable table + link into per-user detail
 * page (S15). Lean v1: counters + table, no client-side filtering
 * yet (URL params for filters can come later).
 */
export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdmin();
  const admin = createAdminClient();

  // Counters (aggregate over current parent_subscriptions rows).
  const counts = await Promise.all([
    countByStatus(admin, "active_monthly"),
    countByStatus(admin, "active_upfront"),
    countByStatus(admin, "trial"),
    countByStatus(admin, "past_due"),
    countByStatus(admin, "cancelled"),
    countByStatus(admin, "lapsed"),
  ]);
  const [activeMonthly, activeUpfront, trial, pastDue, cancelled, lapsed] =
    counts;
  const mrrAud = activeMonthly * 200; // A$200/month
  const activeTotal = activeMonthly + activeUpfront;

  // Filter by status if provided.
  let query = admin
    .from("parent_subscriptions")
    .select(
      "parent_user_id, status, paid_period_ends_at, trial_ends_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(50);
  if (searchParams.status) {
    query = query.eq("status", searchParams.status);
  }
  const { data: subs } = await query.returns<
    Array<{
      parent_user_id: string;
      status: string;
      paid_period_ends_at: string | null;
      trial_ends_at: string | null;
      updated_at: string;
    }>
  >();

  // Batch-resolve parent names.
  const userIds = Array.from(
    new Set((subs ?? []).map((s) => s.parent_user_id)),
  );
  const { data: profiles } = userIds.length
    ? await admin
        .from("user_profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds)
        .returns<
          Array<{
            user_id: string;
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }>
        >()
    : { data: [] };
  const nameByUser = new Map<
    string,
    { first: string | null; last: string | null; email: string | null }
  >();
  for (const p of profiles ?? []) {
    nameByUser.set(p.user_id, {
      first: p.first_name,
      last: p.last_name,
      email: p.email,
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">
        Subscriptions overview
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Counter label="Active" value={activeTotal} />
        <Counter label="Trial" value={trial} />
        <Counter label="Past due" value={pastDue} tone="warn" />
        <Counter
          label="Cancelled / Lapsed"
          value={cancelled + lapsed}
          tone="muted"
        />
      </div>

      <Card className="mt-6 border-violet-200 bg-violet-50/40">
        <CardContent className="space-y-1 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-700">
            MRR (active monthly only)
          </p>
          <p className="text-2xl font-bold text-slate-900">
            A${mrrAud.toLocaleString("en-AU")}
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Filter:</span>
        <FilterChip
          current={searchParams.status}
          value={undefined}
          label="All"
        />
        <FilterChip
          current={searchParams.status}
          value="active_monthly"
          label="Active monthly"
        />
        <FilterChip
          current={searchParams.status}
          value="active_upfront"
          label="Active upfront"
        />
        <FilterChip current={searchParams.status} value="trial" label="Trial" />
        <FilterChip
          current={searchParams.status}
          value="past_due"
          label="Past due"
        />
        <FilterChip
          current={searchParams.status}
          value="cancelled"
          label="Cancelled"
        />
        <FilterChip
          current={searchParams.status}
          value="lapsed"
          label="Lapsed"
        />
      </div>

      <Card className="mt-3">
        <CardContent className="p-0">
          {!subs || subs.length === 0 ? (
            <p className="p-6 text-sm text-slate-600">No matching rows.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Next / period end</th>
                  <th className="px-4 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subs.map((s) => {
                  const p = nameByUser.get(s.parent_user_id);
                  const name = [p?.first, p?.last].filter(Boolean).join(" ");
                  const periodEnd =
                    s.status === "trial"
                      ? s.trial_ends_at
                      : s.paid_period_ends_at;
                  return (
                    <tr key={s.parent_user_id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {name || p?.email || s.parent_user_id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-slate-500">{p?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.status}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {periodEnd ? formatDate(periodEnd) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/users/${s.parent_user_id}/subscription`}
                          className="text-violet-700 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function countByStatus(
  admin: ReturnType<typeof createAdminClient>,
  status: string,
): Promise<number> {
  const { count } = await admin
    .from("parent_subscriptions")
    .select("parent_user_id", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "muted";
}) {
  const valueTone =
    tone === "warn"
      ? "text-amber-700"
      : tone === "muted"
        ? "text-slate-500"
        : "text-slate-900";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-bold ${valueTone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function FilterChip({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const active = current === value || (!current && !value);
  const href = value ? `?status=${value}` : "?";
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-violet-600 text-white"
          : "border border-slate-200 text-slate-600 hover:border-violet-300"
      }`}
    >
      {label}
    </Link>
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
