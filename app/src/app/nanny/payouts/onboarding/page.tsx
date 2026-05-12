import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PayoutOnboardingEmbedded } from "@/components/payments/PayoutOnboardingEmbedded";

/**
 * `/nanny/payouts/onboarding` — Stripe Connect entry (S13 v2 embedded).
 *
 * v2 — embedded `<ConnectAccountOnboarding />` inside Baby Bloom brand
 * chrome via @stripe/react-connect-js.
 *
 * **State-driven rendering** (DSS §8 Q9, 2026-05-12):
 *
 *   not_applied / null / in_progress
 *     → render the embedded form (existing default)
 *   pending  (Stripe reviewing)
 *     → "Stripe is reviewing your details — usually 1-2 business days.
 *        We'll email you the moment they approve."  No form.
 *   verified (already approved)
 *     → redirect to /nanny/payouts (they don't need this page)
 *   restricted (Stripe needs more info OR revoked payouts)
 *     → "Stripe needs a bit more from you to keep payouts active." +
 *        render form below so they can resume
 *   rejected (Stripe denied)
 *     → "We couldn't get your account approved. Please contact us —
 *        we can usually help work it out."  + link to /contact.  No form.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S13.
 */
export default async function NannyOnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/nanny/payouts/onboarding");

  // Resolve current Connect application state. Admin client because
  // `nannies.payout_application_status` isn't user-readable under RLS.
  const admin = createAdminClient();
  const { data: nanny } = await admin
    .from("nannies")
    .select("payout_application_status")
    .eq("user_id", user.id)
    .maybeSingle<{ payout_application_status: string | null }>();

  const status = nanny?.payout_application_status ?? null;

  // Already verified — no need to be here.
  if (status === "verified") {
    redirect("/nanny/payouts");
  }

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

      {status === "pending" ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Stripe is reviewing your details.</p>
            <p className="mt-1">
              Usually within 1–2 business days. We&apos;ll email you the moment
              they approve.
            </p>
          </div>
        </div>
      ) : status === "rejected" ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              We couldn&apos;t get your account approved.
            </p>
            <p className="mt-1">
              Please{" "}
              <Link
                href="/contact"
                className="font-medium underline-offset-2 hover:underline"
              >
                contact us
              </Link>{" "}
              — we can usually help work it out.
            </p>
          </div>
        </div>
      ) : status === "restricted" ? (
        <>
          <div
            role="status"
            className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
          >
            <AlertCircle
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">
                Stripe needs a bit more from you to keep payouts active.
              </p>
              <p className="mt-1">
                Use the form below to provide the requested details.
              </p>
            </div>
          </div>
          <PayoutOnboardingEmbedded />
          <p className="mt-6 text-xs text-slate-500">
            Powered by Stripe. Your information is handled by Stripe, our
            payment partner trusted by businesses worldwide.
          </p>
        </>
      ) : status === "in_progress" ? (
        <>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-900">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Welcome back.</p>
              <p className="mt-1">Pick up where you left off below.</p>
            </div>
          </div>
          <PayoutOnboardingEmbedded />
          <p className="mt-6 text-xs text-slate-500">
            Powered by Stripe. Your information is handled by Stripe, our
            payment partner trusted by businesses worldwide.
          </p>
        </>
      ) : (
        // status === "not_applied" or null — fresh start.
        <>
          <p className="mt-2 text-base text-slate-600">
            We use Stripe to pay you securely. Setting up takes about 2 minutes
            — you&apos;ll need your bank details and ABN.
          </p>
          <PayoutOnboardingEmbedded />
          <p className="mt-6 text-xs text-slate-500">
            Powered by Stripe. Your information is handled by Stripe, our
            payment partner trusted by businesses worldwide.
          </p>
        </>
      )}
    </div>
  );
}
