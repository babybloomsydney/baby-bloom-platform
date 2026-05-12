"use client";

/**
 * PayoutOnboardingEmbedded — S13 v2 embedded Stripe Connect.
 *
 * Renders `<ConnectAccountOnboarding />` inside Baby Bloom branding
 * via `@stripe/react-connect-js`. Replaces the hosted-redirect
 * variant — same server-side account creation, different rendering
 * layer.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S13.
 *
 * On mount: calls `createConnectAccountSession` to mint the Express
 * account (idempotent — reuses an existing one) + a short-lived
 * client secret. The connect.js provider consumes that secret on
 * first render.
 *
 * On Stripe's onExit (user completed or closed the flow): redirects
 * to /nanny/payouts. We don't know whether they completed or just
 * closed — the webhook (account.updated) is authoritative for
 * verification state.
 *
 * "Powered by Stripe" trust-transfer footer per spec psychology
 * notes — even though the form is inline in our app, the badge
 * communicates "Stripe is the regulated party handling your
 * identity + bank details."
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import type { StripeConnectInstance } from "@stripe/connect-js";
import { createConnectAccountSession } from "@/lib/actions/payments/createConnectAccountSession";

export function PayoutOnboardingEmbedded() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialise() {
      try {
        const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if (!pk) {
          if (mounted) setError("Stripe publishable key not configured.");
          return;
        }
        const instance = loadConnectAndInitialize({
          publishableKey: pk,
          fetchClientSecret: async (): Promise<string> => {
            const r = await createConnectAccountSession();
            if (!r.success) {
              throw new Error(r.error);
            }
            return r.data.clientSecret;
          },
          appearance: {
            // Match Baby Bloom violet brand. Documented brand-color
            // overrides — see @stripe/connect-js docs for the full
            // appearance API surface.
            variables: {
              colorPrimary: "#8B5CF6",
              colorBackground: "#FFFFFF",
              colorText: "#0F172A",
              borderRadius: "8px",
            },
          },
        });
        if (mounted) {
          setConnectInstance(instance);
        }
      } catch (err) {
        if (mounted) {
          const msg =
            err instanceof Error ? err.message : "initialisation_failed";
          setError(
            msg === "payments_disabled"
              ? "Subscriptions are temporarily unavailable. Please try again later."
              : msg === "nanny_record_not_found"
                ? "We couldn't find your nanny profile. Contact support."
                : "Couldn't load the onboarding form. Please refresh.",
          );
        }
      }
    }

    void initialise();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div
        role="alert"
        className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!connectInstance) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading onboarding…
      </div>
    );
  }

  return (
    <div className="mt-6">
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding
          onExit={() => {
            // Stripe doesn't tell us whether the user completed or
            // just closed — the account.updated webhook is the
            // authoritative source. Redirect home; if their
            // verification went through, the dashboard will show
            // state C; otherwise state B with the same "Set up
            // payouts" CTA.
            router.push("/nanny/payouts?onboarded=true");
          }}
        />
      </ConnectComponentsProvider>
    </div>
  );
}
