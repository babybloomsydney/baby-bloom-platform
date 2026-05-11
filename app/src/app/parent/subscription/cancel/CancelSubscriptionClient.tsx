"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  cancelSubscription,
  type CancellationReason,
} from "@/lib/actions/payments/cancelSubscription";

interface Props {
  plan: "monthly" | "upfront";
  paidPeriodEndsAt: string | null;
}

const REASONS: ReadonlyArray<{
  value: CancellationReason;
  label: string;
}> = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "service_issue", label: "There's a problem with the service" },
  { value: "circumstances_changed", label: "My circumstances have changed" },
  { value: "other", label: "Something else" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CancelSubscriptionClient({ plan, paidPeriodEndsAt }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmedEndsAt, setConfirmedEndsAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!reason) {
      setError("Please select a reason so we can keep improving Baby Bloom.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscription({
        reason,
        reasonText: reasonText.trim() ? reasonText.trim() : undefined,
      });
      if (!result.success) {
        setError(
          result.error === "payments_disabled"
            ? "Subscriptions are temporarily unavailable. Please try again later."
            : "We couldn't cancel right now. Try again or use the customer portal from your subscription page.",
        );
        return;
      }
      setConfirmedEndsAt(result.data.paidPeriodEndsAt);
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-900">
          Sorry to see you go
        </h1>
        <p className="mt-3 text-base text-slate-600">
          You&apos;ll continue to have access until{" "}
          <strong className="text-slate-900">
            {formatDate(confirmedEndsAt)}
          </strong>
          . Resubscribe any time from your subscription settings.
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Button
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={() => router.push("/parent/subscription")}
          >
            Back to subscription
          </Button>
          <Link
            href="/parent"
            className="mt-2 text-center text-sm text-slate-500 hover:text-slate-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Cancel subscription</h1>
      <p className="mt-2 text-base text-slate-600">
        Cancelling your {plan === "monthly" ? "monthly" : "upfront"} plan.
        You&apos;ll keep access until{" "}
        <strong className="text-slate-900">
          {formatDate(paidPeriodEndsAt)}
        </strong>
        .
      </p>

      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="mt-6">
        <CardContent className="space-y-4 p-6">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Help us improve — why are you leaving?
            </p>
            <fieldset className="mt-3 space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:border-violet-300"
                >
                  <input
                    type="radio"
                    name="cancellation-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1"
                  />
                  <span className="text-sm text-slate-700">{r.label}</span>
                </label>
              ))}
            </fieldset>
          </div>

          <div>
            <label
              htmlFor="cancel-reason-text"
              className="text-sm font-medium text-slate-900"
            >
              Anything else you&apos;d like us to know?{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="cancel-reason-text"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              maxLength={500}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              placeholder="Your feedback is read by a real person on our team."
            />
            <p className="mt-1 text-xs text-slate-400">
              {reasonText.length} / 500
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              size="lg"
              className="w-full bg-violet-600 hover:bg-violet-700"
              disabled={isPending}
              onClick={submit}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm cancellation"
              )}
            </Button>
            <Link
              href="/parent/subscription"
              className="text-center text-sm text-slate-500 hover:text-slate-700"
            >
              Never mind — keep my subscription
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
