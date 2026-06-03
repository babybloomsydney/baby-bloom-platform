/**
 * Server-side derivation of which payment-state banner (if any) the
 * parent shell should render at the top of every parent route.
 *
 * Consumed by `parent/layout.tsx` and passed as props to the client
 * orchestrator `ParentStateBannerHub`. UX-FIX-PLAN FIX-3 (2026-05-12
 * audit).
 *
 * Mutually-exclusive states map cleanly onto the
 * `parent_subscriptions.status` enum + a few dates. No row → no
 * banner; the user is pre-trial and the existing paywalls handle it.
 *
 * The trial countdown uses `Math.ceil` so an end timestamp 23 hours
 * from now reads as "1 day" remaining — the user-facing day-count
 * always rounds up to the next full day until the moment of expiry.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { ParentBannerState } from "@/components/payments/ParentStateBannerHub";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface FirstChildHint {
  id: string;
  first_name: string | null;
}

interface DerivationInput {
  parentUserId: string;
  /**
   * Optional hint — when the caller already has the first child in
   * hand (e.g. the hub server component has fetched it), passing it
   * here avoids an extra DB roundtrip. When omitted, this function
   * fetches the first child itself for child-named banner copy.
   */
  firstChild?: FirstChildHint;
}

export async function deriveParentBannerState({
  parentUserId,
  firstChild,
}: DerivationInput): Promise<ParentBannerState> {
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select(
      // Narrow projection — keep the blast radius small if the schema
      // gains sensitive columns later.
      "status, trial_ends_at, past_due_grace_ends_at, paid_period_ends_at",
    )
    .eq("parent_user_id", parentUserId)
    .maybeSingle<{
      status:
        | "trial"
        | "active_monthly"
        | "active_upfront"
        | "past_due"
        | "cancelled"
        | "lapsed";
      trial_ends_at: string | null;
      past_due_grace_ends_at: string | null;
      paid_period_ends_at: string | null;
    }>();

  if (!sub) return { kind: "none" };

  // Resolve the first child for child-named copy. Skipped on the
  // active-and-positive states where no banner renders anyway.
  // Trial deliberately omitted — no banner during trial per memory
  // `feedback_no_ambient_banners_during_trial` (2026-05-11). Email
  // (T-5 cron) handles trial urgency.
  const wantsChildName = sub.status === "lapsed" || sub.status === "cancelled";
  let childHint: FirstChildHint | undefined = firstChild;
  if (wantsChildName && !childHint) {
    const { data: c } = await admin
      .from("child_client")
      .select("id, first_name")
      .eq("parent_user_id", parentUserId)
      .limit(1)
      .maybeSingle<{ id: string; first_name: string | null }>();
    if (c) childHint = c;
  }

  const now = Date.now();

  switch (sub.status) {
    case "trial":
      // Memory `feedback_no_ambient_banners_during_trial` — product
      // stays focused on child development during trial. Email handles
      // the urgency at T-5 + (TBD) T-1.
      return { kind: "none" };

    case "past_due": {
      if (!sub.past_due_grace_ends_at) return { kind: "none" };
      // If grace already expired the cron flips status to `lapsed`.
      // Until then the banner shows.
      return {
        kind: "past_due",
        graceEndsAt: sub.past_due_grace_ends_at,
      };
    }

    case "cancelled": {
      // Banner only shows while the paid period is still in effect.
      // Post-period-end the cron flips status to `lapsed` and the
      // lapsed banner takes over.
      if (!sub.paid_period_ends_at) return { kind: "none" };
      const endsAt = new Date(sub.paid_period_ends_at).getTime();
      if (endsAt <= now) return { kind: "none" };
      // The closable banner uses a LocalStorage key scoped to a
      // childId. On the hub we use the first child's id (if any)
      // as the scope. With no children we fall back to the parent
      // user id so the key stays stable per user.
      const dismissKey = childHint?.id ?? parentUserId;
      return {
        kind: "cancelled_in_period",
        paidPeriodEndsAt: sub.paid_period_ends_at,
        childIdForDismissalKey: dismissKey,
      };
    }

    case "lapsed":
      return {
        kind: "lapsed",
        childFirstName: childHint?.first_name ?? undefined,
      };

    case "active_monthly":
    case "active_upfront":
    default:
      return { kind: "none" };
  }
}
