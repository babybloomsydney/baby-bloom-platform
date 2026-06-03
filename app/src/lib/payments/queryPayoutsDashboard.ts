/**
 * Server-side data fetch for the nanny payouts dashboard.
 *
 * T-018 rewrite: returns a chronological list of upcoming payouts rather
 * than aggregated tiles. Each entry is one parent payment → one nanny
 * release on one specific date. Real DB rows + computed projections +
 * locked teasers all live in the same list, distinguishable by `kind`.
 *
 * NO writes. Pure read + compute. Money flows through `nanny_payouts`
 * rows (DB); this query produces a display view of them.
 *
 * Spec: system/APP/PAYMENTS/PAYOUTS/05-ux-layer.md + 02-architecture.md.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type UpcomingEntryKind =
  | "real" // status='pending'|'held' nanny_payouts row
  | "real-deferred" // pending row whose release was pushed by past_due
  | "projected" // computed future cycle for an active monthly family
  | "locked-trial" // family in trial — $100 when they subscribe
  | "locked-cancelled" // family cancelled — $100 when they resubscribe
  | "locked-lapsed"; // trial expired — $100 when they ever subscribe

export interface UpcomingEntry {
  /** Stable id. Real rows = nanny_payouts.id. Computed = synthetic. */
  id: string;
  kind: UpcomingEntryKind;
  parentFirstName: string;
  /** "The {Lastname} family". Falls back to "{ParentFirstName}'s family"
   *  when no last_name is on the parent's user_profiles row. */
  familyLabel: string;
  /** Child's first name — used in the contribution copy. */
  childFirstName: string;
  amountAudCents: number;
  /** Real entries have a date. Locked entries have null. */
  scheduledReleaseAt: string | null;
  /** Tooltip text shown when the user taps/hovers the indicator. */
  caveat: string | null;
  /** For upfront rows: "cycle 2 of 3". Otherwise null. */
  cycleLabel: string | null;
}

export interface PayoutsDashboardData {
  /** The soonest 'real' kind entry, or null. Drives the Next Payout tile. */
  nextRealPayout: UpcomingEntry | null;
  /** Full chronological list — real + projected sorted by date, locked last. */
  upcoming: UpcomingEntry[];
  /** Sum of all real `pending|held|paid` rows for current cycle. For header pill. */
  realTotalCents: number;
  /** Sum of locked-trial entries (loss-aversion teaser for header pill). */
  trialTeaserAudCents: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type SubscriptionStatus =
  | "trial"
  | "active_monthly"
  | "active_upfront"
  | "past_due"
  | "cancelled"
  | "lapsed";

interface FamilyRecord {
  parentId: string;
  /** Child's first name (from child_client.first_name). Used in
   *  contribution copy: "support of {childName}". */
  childFirstName: string;
  /** Parent's first name (from user_profiles). Used as the fallback
   *  family label when no last_name is available. */
  parentFirstName: string;
  /** Parent's last name (from user_profiles). When present, the
   *  family is labelled "The {lastName} family". */
  parentLastName: string;
}

interface SubRow {
  parent_user_id: string;
  status: SubscriptionStatus;
  paid_period_starts_at: string | null;
  paid_period_ends_at: string | null;
}

interface PayoutRow {
  id: string;
  parent_user_id: string;
  amount_aud_cents: number;
  status: string;
  scheduled_release_at: string;
  period_start: string;
  failure_reason: string | null;
  paid_at: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NANNY_FAMILY_CAP = 50;
const PROJECTION_HORIZON_CYCLES = 5; // 5 additional projected after the real row → 6 months total
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * MS_PER_DAY;
const THIRTY_DAYS_MS = 30 * MS_PER_DAY;
const COMMISSION_CENTS_MONTHLY = 10_000; // A$100

/** Upfront amount → cycle index. Mirrors commission-engine.ts split. */
const UPFRONT_CYCLE_BY_AMOUNT: Record<number, 1 | 2 | 3> = {
  50_000: 1, // $500
  30_000: 2, // $300
  20_000: 3, // $200
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function fetchPayoutsDashboardData(
  nannyUserId: string,
): Promise<PayoutsDashboardData | null> {
  const admin = createAdminClient();

  const families = await loadFamilies(admin, nannyUserId);
  if (families === null) return null;

  const parentIds = families.map((f) => f.parentId);
  if (parentIds.length === 0) {
    return emptyDashboardData();
  }

  const [subs, profiles, payouts] = await loadSubsProfilesAndPayouts(
    admin,
    nannyUserId,
    parentIds,
  );
  if (subs === null || profiles === null || payouts === null) return null;

  const subsByParent = new Map<string, SubRow>();
  for (const s of subs) subsByParent.set(s.parent_user_id, s);

  const profileByParent = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  for (const p of profiles) {
    profileByParent.set(p.user_id, {
      firstName: p.first_name ?? "",
      lastName: p.last_name ?? "",
    });
  }

  // Enrich with parent's first + last name from the user_profiles row.
  const familiesEnriched: FamilyRecord[] = families.map((f) => {
    const profile = profileByParent.get(f.parentId);
    return {
      parentId: f.parentId,
      childFirstName: f.childFirstName || "your charge",
      parentFirstName: profile?.firstName || "the parent",
      parentLastName: profile?.lastName || "",
    };
  });

  const realTotalCents = computeRealTotalCents(payouts);
  const upcoming = computeUpcomingEntries({
    families: familiesEnriched,
    subsByParent,
    payouts,
    now: new Date(),
  });

  const nextRealPayout =
    upcoming.find((e) => e.kind === "real" || e.kind === "real-deferred") ??
    null;

  const trialTeaserAudCents = upcoming
    .filter((e) => e.kind === "locked-trial")
    .reduce((acc, e) => acc + e.amountAudCents, 0);

  return {
    nextRealPayout,
    upcoming,
    realTotalCents,
    trialTeaserAudCents,
  };
}

// ---------------------------------------------------------------------------
// Helpers — DB loads
// ---------------------------------------------------------------------------

async function loadFamilies(
  admin: ReturnType<typeof createAdminClient>,
  nannyUserId: string,
): Promise<FamilyRecord[] | null> {
  const { data, error } = await admin
    .from("child_client")
    .select("first_name, parent_user_id")
    .eq("nanny_user_id", nannyUserId)
    .not("parent_user_id", "is", null)
    .limit(NANNY_FAMILY_CAP * 4)
    .returns<
      Array<{ first_name: string | null; parent_user_id: string | null }>
    >();
  if (error) {
    console.error("[queryPayoutsDashboard] loadFamilies failed", error);
    return null;
  }

  const seen = new Set<string>();
  const out: FamilyRecord[] = [];
  for (const child of data ?? []) {
    if (!child.parent_user_id) continue;
    if (seen.has(child.parent_user_id)) continue;
    if (out.length >= NANNY_FAMILY_CAP) break;
    seen.add(child.parent_user_id);
    out.push({
      parentId: child.parent_user_id,
      childFirstName: child.first_name ?? "",
      // parentFirstName + parentLastName enriched downstream after
      // user_profiles is loaded.
      parentFirstName: "",
      parentLastName: "",
    });
  }
  return out;
}

async function loadSubsProfilesAndPayouts(
  admin: ReturnType<typeof createAdminClient>,
  nannyUserId: string,
  parentIds: string[],
): Promise<
  [
    SubRow[] | null,
    Array<{
      user_id: string;
      first_name: string | null;
      last_name: string | null;
    }> | null,
    PayoutRow[] | null,
  ]
> {
  const [subsRes, profilesRes, payoutsRes] = await Promise.all([
    admin
      .from("parent_subscriptions")
      .select(
        "parent_user_id, status, paid_period_starts_at, paid_period_ends_at",
      )
      .in("parent_user_id", parentIds)
      .returns<SubRow[]>(),
    admin
      .from("user_profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", parentIds)
      .returns<
        Array<{
          user_id: string;
          first_name: string | null;
          last_name: string | null;
        }>
      >(),
    admin
      .from("nanny_payouts")
      .select(
        "id, parent_user_id, amount_aud_cents, status, scheduled_release_at, period_start, failure_reason, paid_at",
      )
      .eq("nanny_user_id", nannyUserId)
      .in("status", ["pending", "held", "paid"])
      .order("scheduled_release_at", { ascending: true })
      .limit(NANNY_FAMILY_CAP * 12)
      .returns<PayoutRow[]>(),
  ]);

  if (subsRes.error || profilesRes.error || payoutsRes.error) {
    console.error("[queryPayoutsDashboard] sub-query failure", {
      subs: subsRes.error ?? null,
      profiles: profilesRes.error ?? null,
      payouts: payoutsRes.error ?? null,
    });
    return [null, null, null];
  }
  return [subsRes.data ?? [], profilesRes.data ?? [], payoutsRes.data ?? []];
}

// ---------------------------------------------------------------------------
// Helpers — compute
// ---------------------------------------------------------------------------

function computeRealTotalCents(payouts: PayoutRow[]): number {
  // Sum of `paid`, `pending`, `held` rows whose period_start <= today.
  // Mirrors the header-pill earnings-badge definition.
  const todayIso = new Date().toISOString().slice(0, 10);
  return payouts
    .filter(
      (r) =>
        (r.status === "paid" ||
          r.status === "pending" ||
          r.status === "held") &&
        r.period_start <= todayIso,
    )
    .reduce((acc, r) => acc + r.amount_aud_cents, 0);
}

interface ComputeArgs {
  families: FamilyRecord[];
  subsByParent: Map<string, SubRow>;
  payouts: PayoutRow[];
  now: Date;
}

export function computeUpcomingEntries(args: ComputeArgs): UpcomingEntry[] {
  const entries: UpcomingEntry[] = [];
  const payoutsByParent = groupByParent(args.payouts);

  for (const family of args.families) {
    const sub = args.subsByParent.get(family.parentId);
    const familyRealRows = payoutsByParent.get(family.parentId) ?? [];
    const inFlightRows = familyRealRows.filter(
      (r) => r.status === "pending" || r.status === "held",
    );
    const familyLabel = makeFamilyLabel(family);
    const childName = family.childFirstName || "your charge";

    if (!sub) {
      // No subscription row — never subscribed.
      entries.push(
        makeLockedEntry({
          parentId: family.parentId,
          kind: "locked-trial",
          familyLabel,
          firstName: family.parentFirstName,
          childFirstName: childName,
          caveat: `Pending subscription — released when ${familyLabel} subscribes.`,
        }),
      );
      continue;
    }

    switch (sub.status) {
      case "trial":
        entries.push(
          makeLockedEntry({
            parentId: family.parentId,
            kind: "locked-trial",
            familyLabel,
            firstName: family.parentFirstName,
            childFirstName: childName,
            caveat: `Pending subscription — released when ${familyLabel} subscribes.`,
          }),
        );
        break;

      case "active_monthly":
        for (const row of inFlightRows) {
          entries.push(makeRealEntry(row, family, familyLabel, null));
        }
        appendMonthlyProjections({
          entries,
          family,
          familyLabel,
          paidPeriodEndsAt: sub.paid_period_ends_at,
        });
        break;

      case "active_upfront":
        for (const row of inFlightRows) {
          const cycle = UPFRONT_CYCLE_BY_AMOUNT[row.amount_aud_cents] ?? null;
          const cycleLabel = cycle ? `cycle ${cycle} of 3` : null;
          entries.push(makeRealEntry(row, family, familyLabel, cycleLabel));
        }
        break;

      case "past_due":
        for (const row of inFlightRows) {
          entries.push(makeRealEntry(row, family, familyLabel, null));
        }
        break;

      case "cancelled":
        entries.push(
          makeLockedEntry({
            parentId: family.parentId,
            kind: "locked-cancelled",
            familyLabel,
            firstName: family.parentFirstName,
            childFirstName: childName,
            caveat: `Pending re-subscription — released when ${familyLabel} resubscribes.`,
          }),
        );
        break;

      case "lapsed":
        entries.push(
          makeLockedEntry({
            parentId: family.parentId,
            kind: "locked-lapsed",
            familyLabel,
            firstName: family.parentFirstName,
            childFirstName: childName,
            caveat: `Pending subscription — released when ${familyLabel} subscribes.`,
          }),
        );
        break;
    }
  }

  return sortEntries(entries);
}

function makeFamilyLabel(f: FamilyRecord): string {
  const last = f.parentLastName.trim();
  if (last.length > 0) return `The ${last} family`;
  const first = f.parentFirstName.trim();
  if (first.length > 0) return `${first}'s family`;
  return "Your family";
}

// ---------------------------------------------------------------------------
// Helpers — entry constructors
// ---------------------------------------------------------------------------

function makeRealEntry(
  row: PayoutRow,
  family: FamilyRecord,
  familyLabel: string,
  cycleLabel: string | null,
): UpcomingEntry {
  const isDeferred = row.failure_reason === "past_due_release_deferred";
  const childName = family.childFirstName || "your charge";
  return {
    id: row.id,
    kind: isDeferred ? "real-deferred" : "real",
    parentFirstName: family.parentFirstName,
    familyLabel,
    childFirstName: childName,
    amountAudCents: row.amount_aud_cents,
    scheduledReleaseAt: row.scheduled_release_at,
    caveat: isDeferred
      ? `Release deferred — ${familyLabel}'s payment is being retried.`
      : `Contribution towards your developmental support of ${childName} with ${familyLabel}.`,
    cycleLabel,
  };
}

interface LockedArgs {
  parentId: string;
  kind: "locked-trial" | "locked-cancelled" | "locked-lapsed";
  familyLabel: string;
  firstName: string;
  childFirstName: string;
  caveat: string;
}

function makeLockedEntry(a: LockedArgs): UpcomingEntry {
  return {
    id: `${a.kind}-${a.parentId}`,
    kind: a.kind,
    parentFirstName: a.firstName,
    familyLabel: a.familyLabel,
    childFirstName: a.childFirstName,
    amountAudCents: COMMISSION_CENTS_MONTHLY,
    scheduledReleaseAt: null,
    caveat: a.caveat,
    cycleLabel: null,
  };
}

interface MonthlyProjectionArgs {
  entries: UpcomingEntry[];
  family: FamilyRecord;
  familyLabel: string;
  paidPeriodEndsAt: string | null;
}

function appendMonthlyProjections(a: MonthlyProjectionArgs): void {
  if (!a.paidPeriodEndsAt) return;
  const ends = new Date(a.paidPeriodEndsAt);
  if (Number.isNaN(ends.getTime())) return;
  const childName = a.family.childFirstName || "your charge";

  for (let i = 0; i < PROJECTION_HORIZON_CYCLES; i++) {
    const cycleEndMs = ends.getTime() + i * THIRTY_DAYS_MS;
    const releaseMs = cycleEndMs + FOURTEEN_DAYS_MS;
    const releaseIso = new Date(releaseMs).toISOString();
    a.entries.push({
      id: `projected-${a.family.parentId}-${releaseIso.slice(0, 10)}`,
      kind: "projected",
      parentFirstName: a.family.parentFirstName,
      familyLabel: a.familyLabel,
      childFirstName: childName,
      amountAudCents: COMMISSION_CENTS_MONTHLY,
      scheduledReleaseAt: releaseIso,
      caveat: `Contribution towards your developmental support of ${childName} with ${a.familyLabel}.`,
      cycleLabel: null,
    });
  }
}

function groupByParent(rows: PayoutRow[]): Map<string, PayoutRow[]> {
  const m = new Map<string, PayoutRow[]>();
  for (const r of rows) {
    const arr = m.get(r.parent_user_id) ?? [];
    arr.push(r);
    m.set(r.parent_user_id, arr);
  }
  return m;
}

function sortEntries(entries: UpcomingEntry[]): UpcomingEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.scheduledReleaseAt && b.scheduledReleaseAt) {
      return a.scheduledReleaseAt.localeCompare(b.scheduledReleaseAt);
    }
    if (a.scheduledReleaseAt && !b.scheduledReleaseAt) return -1;
    if (!a.scheduledReleaseAt && b.scheduledReleaseAt) return 1;
    return a.parentFirstName.localeCompare(b.parentFirstName);
  });
}

function emptyDashboardData(): PayoutsDashboardData {
  return {
    nextRealPayout: null,
    upcoming: [],
    realTotalCents: 0,
    trialTeaserAudCents: 0,
  };
}
