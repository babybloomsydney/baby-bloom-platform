"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createCheckoutSession } from "@/lib/actions/payments/checkout";

interface SubscribeClientProps {
  trialAvailable: boolean;
}

export function SubscribeClient({ trialAvailable }: SubscribeClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<"monthly" | "upfront" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function subscribe(plan: "monthly" | "upfront") {
    setError(null);
    setActivePlan(plan);
    startTransition(async () => {
      const result = await createCheckoutSession({ plan });
      if (!result.success || !result.data) {
        setError(
          result.error === "test_users_cannot_pay"
            ? "Test accounts have full access — no payment needed."
            : result.error === "payments_disabled"
              ? "Subscriptions are temporarily unavailable. Please try again later."
              : (result.error ?? "Couldn't start checkout."),
        );
        setActivePlan(null);
        return;
      }
      // Hand off to Stripe Checkout.
      router.push(result.data.url);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">
        Choose your subscription
      </h1>
      <p className="mt-2 text-slate-600">
        Track {`{your child}'s`} development with daily activities, milestones,
        and your nanny&apos;s notes.
      </p>

      {trialAvailable && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm text-violet-900">
            <strong>Start with a 30-day free trial.</strong> No charge today.
            Choose how you&apos;d like to pay when the trial ends.
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* Monthly card */}
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Monthly
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                A$200
                <span className="text-base font-normal text-slate-500">
                  /month
                </span>
              </p>
            </div>
            <p className="text-sm text-slate-600">
              Cancel anytime. Pay as you go.
            </p>
            <div className="flex-1" />
            <Button
              size="lg"
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={isPending}
              onClick={() => subscribe("monthly")}
            >
              {activePlan === "monthly" && isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Subscribe monthly"
              )}
            </Button>
            {trialAvailable && (
              <p className="text-xs text-slate-500">
                Trial first — charged after 30 days.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Upfront card */}
        <Card className="relative flex flex-col border-violet-200">
          <span className="absolute -top-3 right-4 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-medium text-white">
            Best value
          </span>
          <CardContent className="flex flex-1 flex-col gap-4 p-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Upfront
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">A$2,000</p>
            </div>
            <p className="text-sm text-slate-600">
              Pay once for access until your child&apos;s 5th birthday. Best
              value if your child is under 4.
            </p>
            <div className="flex-1" />
            <Button
              size="lg"
              variant="outline"
              className="w-full border-violet-300 text-violet-700 hover:bg-violet-50"
              disabled={isPending}
              onClick={() => subscribe("upfront")}
            >
              {activePlan === "upfront" && isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Pay upfront"
              )}
            </Button>
            {trialAvailable && (
              <p className="text-xs text-slate-500">
                Trial first — charged after 30 days.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        GST included. Australian customers only. By subscribing you agree to our
        terms of service.
      </p>
    </div>
  );
}
