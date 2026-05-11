import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CancelSubscriptionClient } from "./CancelSubscriptionClient";

/**
 * Cancel subscription page (S9).
 *
 * Server component:
 *   - Authenticates the user
 *   - Confirms there's an active subscription to cancel
 *   - Passes the active plan + period-end date to the client form
 *
 * The client form captures the reason → submits to
 * `cancelSubscription` server action → renders confirmation copy
 * with the paid-period-end date.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S9.
 */
export default async function CancelSubscriptionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/parent/subscription/cancel");

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select("status, paid_period_ends_at")
    .eq("parent_user_id", user.id)
    .maybeSingle<{
      status:
        | "trial"
        | "active_monthly"
        | "active_upfront"
        | "past_due"
        | "cancelled"
        | "lapsed"
        | null;
      paid_period_ends_at: string | null;
    }>();

  // Not cancellable — bounce back to the management page.
  if (
    !sub ||
    (sub.status !== "active_monthly" && sub.status !== "active_upfront")
  ) {
    redirect("/parent/subscription");
  }

  return (
    <CancelSubscriptionClient
      plan={sub.status === "active_monthly" ? "monthly" : "upfront"}
      paidPeriodEndsAt={sub.paid_period_ends_at}
    />
  );
}
