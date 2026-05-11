import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubscriptionClient } from "./SubscriptionClient";

/**
 * Parent Subscription management page.
 *
 * Spec: `system/APP/PAYMENTS/10-ui-surfaces.md` §4.
 *
 * Shows the parent their current subscription state + state-dependent
 * action buttons (manage / subscribe / request-refund). Billing-history
 * view is deferred — this v1 surfaces the actions that drive the most
 * common operations (cancel, update card, subscribe-after-lapse).
 */
export default async function ParentSubscriptionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/parent/subscription");

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select(
      "status, trial_started_at, trial_ends_at, paid_period_starts_at, paid_period_ends_at, past_due_grace_ends_at, cancelled_at, has_used_trial",
    )
    .eq("parent_user_id", user.id)
    .maybeSingle();

  return <SubscriptionClient subscription={sub ?? null} />;
}
