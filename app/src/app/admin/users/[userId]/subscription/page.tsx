import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/require-admin";
import { Card, CardContent } from "@/components/ui/card";

/**
 * `/admin/users/[userId]/subscription` — per-user detail (S15).
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S15.
 *
 * v1: read-only view of subscription state, payment history, and
 * connected nanny earnings impact. Refund authorisation UI is
 * deferred (admin uses Stripe Dashboard at launch). Test-user
 * toggle is deferred (SQL flip until UI built).
 */
export default async function AdminUserSubscriptionPage({
  params,
}: {
  params: { userId: string };
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const [
    { data: profile },
    { data: sub },
    { data: children },
    { data: payouts },
  ] = await Promise.all([
    admin
      .from("user_profiles")
      .select("first_name, last_name, email, is_test_user")
      .eq("user_id", params.userId)
      .maybeSingle<{
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        is_test_user: boolean | null;
      }>(),
    admin
      .from("parent_subscriptions")
      .select("*")
      .eq("parent_user_id", params.userId)
      .maybeSingle(),
    admin
      .from("child_client")
      .select("id, first_name, nanny_user_id")
      .eq("parent_user_id", params.userId)
      .returns<
        Array<{
          id: string;
          first_name: string | null;
          nanny_user_id: string | null;
        }>
      >(),
    admin
      .from("nanny_payouts")
      .select("status, amount_aud_cents, paid_at, period_start, period_end")
      .eq("parent_user_id", params.userId)
      .order("scheduled_release_at", { ascending: false })
      .limit(24)
      .returns<
        Array<{
          status: string;
          amount_aud_cents: number;
          paid_at: string | null;
          period_start: string;
          period_end: string;
        }>
      >(),
  ]);

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  const totalPaidCents = (payouts ?? [])
    .filter((p) => p.status === "paid")
    .reduce((acc, p) => acc + p.amount_aud_cents, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/admin/subscriptions"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Back to subscriptions
      </Link>
      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {fullName || profile?.email || "User"}
          </h1>
          {profile?.email && (
            <p className="text-sm text-slate-500">{profile.email}</p>
          )}
        </div>
        {profile?.is_test_user && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Test user
          </span>
        )}
      </div>

      <Card className="mt-6">
        <CardContent className="space-y-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Subscription
          </p>
          {!sub ? (
            <p className="text-sm text-slate-600">No subscription record.</p>
          ) : (
            <dl className="space-y-1 text-sm">
              <Row label="Status" value={sub.status} />
              <Row
                label="Trial ended"
                value={sub.trial_ends_at ? formatDate(sub.trial_ends_at) : "—"}
              />
              <Row
                label="Paid period ends"
                value={
                  sub.paid_period_ends_at
                    ? formatDate(sub.paid_period_ends_at)
                    : "—"
                }
              />
              <Row
                label="Cancelled at"
                value={sub.cancelled_at ? formatDate(sub.cancelled_at) : "—"}
              />
              <Row
                label="Cancellation reason"
                value={sub.cancellation_reason ?? "—"}
              />
              <Row
                label="Stripe customer"
                value={sub.stripe_customer_id ?? "—"}
              />
              <Row
                label="Stripe subscription"
                value={sub.stripe_subscription_id ?? "—"}
              />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="space-y-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Children + nanny earnings impact
          </p>
          {!children || children.length === 0 ? (
            <p className="text-sm text-slate-600">No connected children.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {children.map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span className="text-slate-700">
                    {c.first_name || "child"}{" "}
                    {c.nanny_user_id ? "(nanny linked)" : "(no nanny)"}
                  </span>
                  <span className="text-slate-500">{c.id.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="pt-2 text-sm text-slate-600">
            Past paid to nanny:{" "}
            <strong className="text-slate-900">
              A${(totalPaidCents / 100).toFixed(2)}
            </strong>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Refund processing
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Refund authorisation is via Stripe Dashboard at launch. Use the
            Stripe customer id above to look the parent up, then process the
            refund there. The webhook handler will flip our records.
          </p>
          {sub?.stripe_customer_id && (
            <a
              href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-violet-700 hover:underline"
            >
              Open in Stripe Dashboard ↗
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
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
