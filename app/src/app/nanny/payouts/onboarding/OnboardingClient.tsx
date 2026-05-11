"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startConnectOnboarding } from "@/lib/actions/payments/startConnectOnboarding";

export function OnboardingClient() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const r = await startConnectOnboarding();
      if (!r.success) {
        setError(
          r.error === "payments_disabled"
            ? "Subscriptions are temporarily unavailable. Please try again later."
            : r.error === "nanny_record_not_found"
              ? "We couldn't find your nanny profile. Contact support if this persists."
              : "Couldn't start onboarding. Please try again.",
        );
        return;
      }
      window.location.href = r.data.url;
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button
        size="lg"
        className="w-full bg-violet-600 hover:bg-violet-700"
        disabled={isPending}
        onClick={start}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Continue to Stripe <ExternalLink className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
