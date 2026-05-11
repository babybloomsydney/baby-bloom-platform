import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RefundRequestClient } from "./RefundRequestClient";

/**
 * Parent refund-request form.
 *
 * Spec: `system/APP/PAYMENTS/10-ui-surfaces.md` §5.
 *
 * Server gate — only `active_upfront` subscribers see the form;
 * monthly cancellations route through Customer Portal instead.
 */
export default async function RefundRequestPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/parent/subscription/refund-request");

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select("status")
    .eq("parent_user_id", user.id)
    .maybeSingle<{ status: string }>();

  if (!sub || sub.status !== "active_upfront") {
    // Per spec AC-5.2 — refund flow gated to upfront subscribers.
    redirect("/parent/subscription");
  }

  return <RefundRequestClient />;
}
