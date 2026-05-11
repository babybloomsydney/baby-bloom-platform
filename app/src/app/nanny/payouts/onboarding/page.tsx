import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./OnboardingClient";

/**
 * `/nanny/payouts/onboarding` — Stripe Connect entry (S13).
 *
 * v1 = hosted redirect. Page just renders a launch button + benefits
 * blurb; clicking the button calls `startConnectOnboarding` which
 * returns a hosted URL the client then redirects to. Stripe collects
 * legal name / DOB / address / bank / ABN / ID on its own pages and
 * returns the nanny to /nanny/payouts on completion.
 *
 * v2 (deferred) = embedded `<ConnectAccountOnboarding />` — same
 * server-side account creation, different rendering layer. Requires
 * `@stripe/react-connect-js` dependency.
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
    <div className="mx-auto max-w-xl px-4 py-12">
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

      <OnboardingClient />

      <p className="mt-6 text-xs text-slate-500">
        Powered by Stripe. Your information is handled by Stripe, our payment
        partner trusted by businesses worldwide.
      </p>
    </div>
  );
}
