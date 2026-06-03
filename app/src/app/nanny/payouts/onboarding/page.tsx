import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PayoutOnboardingPageClient } from "./PayoutOnboardingPageClient";
import { fetchPayoutOnboardingViewData } from "@/lib/payments/queryNannyPayoutOnboarding";

/**
 * `/nanny/payouts/onboarding` — standalone onboarding route. Renders
 * the same `PayoutOnboardingPageClient` that the settings tree
 * embeds. Card-style layout modelled on `/nanny/verification`.
 */
export default async function NannyOnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/nanny/payouts/onboarding");

  const data = await fetchPayoutOnboardingViewData(user.id);

  return (
    <PayoutOnboardingPageClient
      status={data.status}
      email={user.email ?? null}
      bankSummary={data.bankSummary}
    />
  );
}
