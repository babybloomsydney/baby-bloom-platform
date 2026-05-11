import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubscribeClient } from "./SubscribeClient";

/**
 * Parent Subscribe page — two-card chooser: monthly vs upfront.
 *
 * Spec: `system/APP/PAYMENTS/10-ui-surfaces.md` §3.
 *
 * The server component is thin — it authenticates, looks up the parent's
 * current subscription state (to show the trial banner if available),
 * and renders the client component that wires the CTA → server action
 * `createCheckoutSession`.
 */
export default async function ParentSubscribePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/parent/subscribe");

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select("status, has_used_trial")
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
      has_used_trial: boolean | null;
    }>();

  const isActive =
    sub?.status === "trial" ||
    sub?.status === "active_monthly" ||
    sub?.status === "active_upfront" ||
    sub?.status === "past_due";

  // Already subscribed — bounce to the management page instead of letting
  // them double-subscribe. They can cancel from the portal.
  if (isActive) {
    redirect("/parent/subscription");
  }

  const trialAvailable = !sub?.has_used_trial;

  return <SubscribeClient trialAvailable={trialAvailable} />;
}
