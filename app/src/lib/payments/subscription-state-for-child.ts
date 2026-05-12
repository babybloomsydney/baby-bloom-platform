/**
 * Read the subscription state for a given child's family, in a shape
 * the BAppLayout state-pill UI consumes.
 *
 * UX-FIX-PLAN FIX-8 (2026-05-12 audit). The dev page was previously
 * silent on trial/active/cancelled-in-period/past-due states for the
 * nanny side — three of four real states rendered identically as
 * "No entries yet. Tap + to get started." This helper surfaces the
 * underlying state so the layout can render a contextual pill.
 *
 * Note: `requireChildFamilyAccess` returns a yes/no plus a reason
 * code, but doesn't expose the row's status. The pill needs the
 * underlying status to choose between "Trial — Nd left", "Active",
 * "Cancelled — until Nov 15", "Payment past due", etc.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type SubscriptionStateForPill =
  | { kind: "trial"; daysRemaining: number }
  | { kind: "active_monthly" }
  | { kind: "active_upfront" }
  | { kind: "past_due"; graceEndsAt: string }
  | { kind: "cancelled_in_period"; paidPeriodEndsAt: string }
  | { kind: "lapsed" }
  // No row OR no parent linked yet — pre-payments state. The dev
  // page has its own InviteBanner for the nanny-only case.
  | { kind: "none" };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function getSubscriptionStateForChild(
  childId: string,
): Promise<SubscriptionStateForPill> {
  if (!childId) return { kind: "none" };
  const admin = createAdminClient();

  const { data: child } = await admin
    .from("child_client")
    .select("parent_user_id")
    .eq("id", childId)
    .maybeSingle<{ parent_user_id: string | null }>();

  if (!child?.parent_user_id) return { kind: "none" };

  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select(
      "status, trial_ends_at, past_due_grace_ends_at, paid_period_ends_at",
    )
    .eq("parent_user_id", child.parent_user_id)
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

  const now = Date.now();

  switch (sub.status) {
    case "trial": {
      if (!sub.trial_ends_at) return { kind: "none" };
      const daysRemaining = Math.max(
        0,
        Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / ONE_DAY_MS),
      );
      return { kind: "trial", daysRemaining };
    }
    case "active_monthly":
      return { kind: "active_monthly" };
    case "active_upfront":
      return { kind: "active_upfront" };
    case "past_due":
      return sub.past_due_grace_ends_at
        ? { kind: "past_due", graceEndsAt: sub.past_due_grace_ends_at }
        : { kind: "none" };
    case "cancelled": {
      if (!sub.paid_period_ends_at) return { kind: "lapsed" };
      const endsAt = new Date(sub.paid_period_ends_at).getTime();
      if (endsAt <= now) return { kind: "lapsed" };
      return {
        kind: "cancelled_in_period",
        paidPeriodEndsAt: sub.paid_period_ends_at,
      };
    }
    case "lapsed":
      return { kind: "lapsed" };
    default:
      return { kind: "none" };
  }
}
