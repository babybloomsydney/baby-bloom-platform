import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountTotalTile } from "@/components/payments/AccountTotalTile";
import { FamilyPayoutCard } from "@/components/payments/FamilyPayoutCard";
import { EarningsExplainer } from "@/components/payments/EarningsExplainer";
import { deriveFamilyPayoutState } from "@/lib/payments/payouts-state";

/**
 * `/nanny/payouts` — the dashboard.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S12.
 *
 * For each family the nanny serves:
 *   1. Resolve parent_subscriptions row (status + paid period start).
 *   2. Check if any nanny_payouts have been paid for this family.
 *   3. Derive the sub-state via `deriveFamilyPayoutState`.
 *   4. Render a FamilyPayoutCard with the right copy + icon.
 *
 * Account total at top sums families × A$100 — even locked + frozen
 * families count toward the visible total (loss-aversion engine).
 */
export default async function NannyPayoutsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/nanny/payouts");

  const admin = createAdminClient();

  // Find all (active or recently ended) child_clients where this user
  // is the nanny. We group by parent_user_id since one parent may
  // have multiple children — the family-level subscription is the
  // unit of payout.
  const { data: children } = await admin
    .from("child_client")
    .select("id, first_name, parent_user_id")
    .eq("nanny_user_id", user.id)
    .not("parent_user_id", "is", null)
    .returns<
      Array<{
        id: string;
        first_name: string | null;
        parent_user_id: string | null;
      }>
    >();

  type FamilyTile = {
    familyId: string;
    label: string;
    parentFirstName: string;
    childFirstName: string;
    state: ReturnType<typeof deriveFamilyPayoutState>;
    lastPayoutAt: string | null;
  };

  const familyTiles: FamilyTile[] = [];
  const seenParents = new Set<string>();

  for (const child of children ?? []) {
    if (!child.parent_user_id) continue;
    if (seenParents.has(child.parent_user_id)) continue;
    seenParents.add(child.parent_user_id);

    const [{ data: sub }, { data: parentProfile }, { data: latestPayout }] =
      await Promise.all([
        admin
          .from("parent_subscriptions")
          .select("status, paid_period_starts_at, has_used_trial")
          .eq("parent_user_id", child.parent_user_id)
          .maybeSingle<{
            status:
              | "trial"
              | "active_monthly"
              | "active_upfront"
              | "past_due"
              | "cancelled"
              | "lapsed";
            paid_period_starts_at: string | null;
            has_used_trial: boolean | null;
          }>(),
        admin
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", child.parent_user_id)
          .maybeSingle<{ first_name: string | null }>(),
        admin
          .from("nanny_payouts")
          .select("paid_at, status")
          .eq("nanny_user_id", user.id)
          .eq("parent_user_id", child.parent_user_id)
          .eq("status", "paid")
          .order("paid_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ paid_at: string | null; status: string }>(),
      ]);

    const state = deriveFamilyPayoutState({
      subscriptionStatus: sub?.status ?? null,
      paidStartedAt: sub?.paid_period_starts_at ?? null,
      hasUsedTrial: sub?.has_used_trial ?? false,
      hasPaidPayouts: Boolean(latestPayout?.paid_at),
    });

    const parentName = parentProfile?.first_name ?? "the parent";
    const childName = child.first_name ?? "your charge";

    familyTiles.push({
      familyId: child.parent_user_id,
      label: `${parentName}'s family — ${childName}`,
      parentFirstName: parentName,
      childFirstName: childName,
      state,
      lastPayoutAt: latestPayout?.paid_at ?? null,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Payouts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your earnings across every family you support.
      </p>

      <div className="mt-6">
        <AccountTotalTile familyCount={familyTiles.length} />
      </div>

      {familyTiles.length === 0 ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
          No families yet. Once you onboard a child + invite the parent, your
          earnings will start to show here.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {familyTiles.map((tile) => (
            <FamilyPayoutCard
              key={tile.familyId}
              familyId={tile.familyId}
              label={tile.label}
              parentFirstName={tile.parentFirstName}
              childFirstName={tile.childFirstName}
              state={tile.state}
              lastPayoutAt={tile.lastPayoutAt}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <EarningsExplainer />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link
          href="/nanny/payouts/history"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          See full payout history →
        </Link>
        <Link
          href="/nanny/payouts/onboarding"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Set up your payout account →
        </Link>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-6">
        <Link
          href="/nanny"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
