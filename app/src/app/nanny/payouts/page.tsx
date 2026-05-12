import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountTotalTile } from "@/components/payments/AccountTotalTile";
import { FamilyPayoutCard } from "@/components/payments/FamilyPayoutCard";
import { EarningsExplainer } from "@/components/payments/EarningsExplainer";
import { deriveFamilyPayoutState } from "@/lib/payments/payouts-state";

/**
 * Visible-but-graceful error fallback when one of the underlying
 * Supabase queries fails. Previously the page would silently render
 * a wrong-state dashboard (zero payouts, generic names) — the nanny
 * had no way to distinguish "no families yet" from "DB hiccup". This
 * state tells her the data couldn't be loaded + invites her to retry.
 */
function PayoutsErrorState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Payouts</h1>
      <div
        role="alert"
        className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">
            Couldn&apos;t load your payouts right now.
          </p>
          <p>Please refresh the page in a moment.</p>
        </div>
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
  //
  // Hard cap: a single nanny working > 50 families simultaneously
  // does not happen in this product, but the limit defends against
  // pathological data + caps the worst-case query cost.
  const NANNY_FAMILY_CAP = 50;
  const { data: children, error: childrenErr } = await admin
    .from("child_client")
    .select("id, first_name, parent_user_id")
    .eq("nanny_user_id", user.id)
    .not("parent_user_id", "is", null)
    .limit(NANNY_FAMILY_CAP * 4)
    .returns<
      Array<{
        id: string;
        first_name: string | null;
        parent_user_id: string | null;
      }>
    >();
  if (childrenErr) {
    return <PayoutsErrorState />;
  }

  type FamilyTile = {
    familyId: string;
    label: string;
    parentFirstName: string;
    childFirstName: string;
    state: ReturnType<typeof deriveFamilyPayoutState>;
    lastPayoutAt: string | null;
  };

  // Dedupe parent_user_ids first so the three batched lookups below
  // touch the minimum row count. Previously this was an N+1 loop
  // (3 queries per family); now it's three queries total regardless
  // of how many families.
  const parentIds: string[] = [];
  const seenParents = new Set<string>();
  const firstChildPerParent = new Map<
    string,
    { id: string; first_name: string | null }
  >();
  for (const child of children ?? []) {
    if (!child.parent_user_id) continue;
    if (seenParents.has(child.parent_user_id)) continue;
    if (parentIds.length >= NANNY_FAMILY_CAP) break;
    seenParents.add(child.parent_user_id);
    parentIds.push(child.parent_user_id);
    firstChildPerParent.set(child.parent_user_id, {
      id: child.id,
      first_name: child.first_name,
    });
  }

  type SubscriptionStatus =
    | "trial"
    | "active_monthly"
    | "active_upfront"
    | "past_due"
    | "cancelled"
    | "lapsed";
  type SubRow = {
    parent_user_id: string;
    status: SubscriptionStatus;
    paid_period_starts_at: string | null;
    has_used_trial: boolean | null;
  };
  type ProfileRow = { user_id: string; first_name: string | null };
  type PayoutRow = {
    parent_user_id: string;
    paid_at: string | null;
    status: string;
  };

  // Empty `parentIds` short-circuits the batched lookups — the
  // PostgREST `in()` filter against `[]` would otherwise issue a
  // pointless network call. Both branches return the same shape
  // ({ data, error }) so the destructure below stays uniform and
  // doesn't need a separate cast at consumer sites.
  type QueryResult<T> = {
    data: T[] | null;
    error: { message: string } | null;
  };

  const [subsRes, profilesRes, payoutsRes]: [
    QueryResult<SubRow>,
    QueryResult<ProfileRow>,
    QueryResult<PayoutRow>,
  ] =
    parentIds.length === 0
      ? [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]
      : await Promise.all([
          admin
            .from("parent_subscriptions")
            .select(
              "parent_user_id, status, paid_period_starts_at, has_used_trial",
            )
            .in("parent_user_id", parentIds)
            .returns<SubRow[]>(),
          admin
            .from("user_profiles")
            .select("user_id, first_name")
            .in("user_id", parentIds)
            .returns<ProfileRow[]>(),
          admin
            .from("nanny_payouts")
            .select("parent_user_id, paid_at, status")
            .eq("nanny_user_id", user.id)
            .in("parent_user_id", parentIds)
            .eq("status", "paid")
            .order("paid_at", { ascending: false })
            // We only need ONE row per family — the latest paid
            // payout — so cap reads at NANNY_FAMILY_CAP. Without the
            // limit a long-tenured nanny with 50 families × hundreds
            // of historical payouts would pull every paid row only
            // to discard most of them in the `!has()` first-wins
            // dedupe below.
            .limit(NANNY_FAMILY_CAP)
            .returns<PayoutRow[]>(),
        ]);

  // Surface DB errors. The page was previously a silent degraded
  // render — empty maps would make every family look like a zero-
  // payout brand-new account. Render an explicit error state so the
  // nanny knows there's a fetch problem rather than that her work
  // hasn't been paid.
  if (subsRes.error || profilesRes.error || payoutsRes.error) {
    return <PayoutsErrorState />;
  }

  const subsByParent = new Map<
    string,
    {
      status: SubscriptionStatus;
      paid_period_starts_at: string | null;
      has_used_trial: boolean | null;
    }
  >();
  for (const s of subsRes.data ?? []) {
    subsByParent.set(s.parent_user_id, {
      status: s.status,
      paid_period_starts_at: s.paid_period_starts_at,
      has_used_trial: s.has_used_trial,
    });
  }

  const profileByParent = new Map<string, string | null>();
  for (const p of profilesRes.data ?? []) {
    profileByParent.set(p.user_id, p.first_name);
  }

  // Latest paid payout per family — `.order("paid_at desc")` above
  // means the first row per parent_user_id is the most recent.
  const latestPaidByParent = new Map<string, string | null>();
  for (const p of payoutsRes.data ?? []) {
    if (!latestPaidByParent.has(p.parent_user_id)) {
      latestPaidByParent.set(p.parent_user_id, p.paid_at);
    }
  }

  const familyTiles: FamilyTile[] = parentIds.map((parentId) => {
    const child = firstChildPerParent.get(parentId);
    const sub = subsByParent.get(parentId);
    const parentName = profileByParent.get(parentId) ?? "the parent";
    const childName = child?.first_name ?? "your charge";
    const lastPayoutAt = latestPaidByParent.get(parentId) ?? null;

    const state = deriveFamilyPayoutState({
      subscriptionStatus: sub?.status ?? null,
      paidStartedAt: sub?.paid_period_starts_at ?? null,
      hasUsedTrial: sub?.has_used_trial ?? false,
      hasPaidPayouts: Boolean(lastPayoutAt),
    });

    return {
      familyId: parentId,
      label: `${parentName}'s family — ${childName}`,
      parentFirstName: parentName,
      childFirstName: childName,
      state,
      lastPayoutAt,
    };
  });

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
