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
// UX-FIX-PLAN FIX-5 (2026-05-12 audit) — the Checkout success URL
// lands here with `?status=success`. Without force-dynamic Next.js
// can serve a cached pre-checkout render which makes the parent
// think their payment didn't take. Trust-critical: the conversion-
// validating moment must reflect live DB state.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    status?: string;
    session_id?: string;
  };
}

export default async function ParentSubscriptionPage({
  searchParams,
}: PageProps) {
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

  // Resolve a first child + a connected nanny name for the
  // success-banner copy. Best-effort: missing data falls back to
  // generic copy.
  const justSubscribed = searchParams.status === "success";
  let childFirstName: string | null = null;
  let nannyFirstName: string | null = null;
  if (justSubscribed) {
    const { data: child } = await admin
      .from("child_client")
      .select("first_name, nanny_user_id")
      .eq("parent_user_id", user.id)
      .limit(1)
      .maybeSingle<{
        first_name: string | null;
        nanny_user_id: string | null;
      }>();
    if (child) {
      childFirstName = child.first_name;
      if (child.nanny_user_id) {
        const { data: nanny } = await admin
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", child.nanny_user_id)
          .maybeSingle<{ first_name: string | null }>();
        nannyFirstName = nanny?.first_name ?? null;
      }
    }
  }

  return (
    <SubscriptionClient
      subscription={sub ?? null}
      justSubscribed={justSubscribed}
      childFirstName={childFirstName}
      nannyFirstName={nannyFirstName}
    />
  );
}
