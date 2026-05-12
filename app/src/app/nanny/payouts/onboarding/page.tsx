import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PayoutOnboardingEmbedded } from "@/components/payments/PayoutOnboardingEmbedded";

/**
 * `/nanny/payouts/onboarding` — Stripe Connect entry (S13 v2 embedded).
 *
 * v2 (now live) — embedded `<ConnectAccountOnboarding />` inside
 * Baby Bloom brand chrome via @stripe/react-connect-js. Spec §
 * psychology: trust-transfer via "Powered by Stripe" footer +
 * brand-matched component appearance (violet primary, BB radius).
 *
 * v1 was hosted redirect via `startConnectOnboarding`. That server
 * action is retained as a fallback path — useful if a future
 * Connect API change breaks the embedded component faster than we
 * can patch.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S13.
 */
export default async function NannyOnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/nanny/payouts/onboarding");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/nanny/payouts"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Back to payouts
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">
        Set up your payout account
      </h1>
      <p className="mt-2 text-base text-slate-600">
        We use Stripe to pay you securely. Setting up takes about 2 minutes —
        you&apos;ll need your bank details and ABN.
      </p>

      <PayoutOnboardingEmbedded />

      <p className="mt-6 text-xs text-slate-500">
        Powered by Stripe. Your information is handled by Stripe, our payment
        partner trusted by businesses worldwide.
      </p>
    </div>
  );
}
