"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  submitRefundRequest,
  previewRefundAmount,
} from "@/lib/actions/payments/refund-request";
import type { RefundCase } from "@/lib/payments/refund-engine";

const MIN_REASON_TEXT = 50;

const REASON_OPTIONS: Array<{
  value: RefundCase;
  label: string;
  hint?: string;
}> = [
  {
    value: "major_problem",
    label: "There's a major problem with the service",
  },
  {
    value: "reasonable_cause",
    label: "My family's circumstances have changed",
  },
  {
    value: "change_of_mind",
    label: "I just don't need it anymore",
    hint: "We typically can't refund change-of-mind requests, but you can still submit one.",
  },
];

function formatAud(cents: number): string {
  const dollars = cents / 100;
  return `A$${dollars.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RefundRequestClient() {
  const [reasonCategory, setReasonCategory] = useState<RefundCase | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [previewCents, setPreviewCents] = useState<number | null>(null);
  const [previewFloored, setPreviewFloored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Live preview of the refund amount when reason category changes.
  useEffect(() => {
    if (!reasonCategory) {
      setPreviewCents(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await previewRefundAmount({ reasonCategory });
      if (cancelled) return;
      if (result.success && result.data) {
        setPreviewCents(result.data.refundAmountCents);
        setPreviewFloored(result.data.floored);
      } else {
        setPreviewCents(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reasonCategory]);

  const reasonTextValid = reasonText.trim().length >= MIN_REASON_TEXT;
  const canSubmit =
    !!reasonCategory && reasonTextValid && acknowledged && !isPending;

  function submit() {
    if (!reasonCategory) return;
    setError(null);
    startTransition(async () => {
      const result = await submitRefundRequest({
        reasonCategory,
        reasonText: reasonText.trim(),
      });
      if (!result.success) {
        setError(
          result.error === "reason_too_short"
            ? "Please write a bit more — we use this to review your request fairly."
            : result.error === "refund_only_for_upfront"
              ? "Refund requests are only available on upfront subscriptions."
              : (result.error ?? "Couldn't submit your request."),
        );
        return;
      }
      setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          Request received
        </h1>
        <p className="mt-3 text-base text-slate-600">
          We&apos;ll review your request manually and respond within 14 business
          days. We&apos;ll email you when there&apos;s an update.
        </p>
        <Link
          href="/parent/subscription"
          className="mt-8 inline-block text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to subscription
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Request a refund</h1>
      <p className="mt-2 text-base text-slate-600">
        We review every refund request manually. We&apos;ll respond within 14
        business days.
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
        <CardContent className="space-y-6 p-6">
          {/* Reason category */}
          <fieldset>
            <legend className="text-sm font-medium text-slate-900">
              Why are you requesting a refund?
            </legend>
            <div className="mt-3 space-y-2">
              {REASON_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-violet-300"
                >
                  <input
                    type="radio"
                    name="reasonCategory"
                    value={option.value}
                    checked={reasonCategory === option.value}
                    onChange={() => setReasonCategory(option.value)}
                    className="mt-0.5 h-4 w-4 text-violet-600 focus:ring-violet-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-slate-900">{option.label}</p>
                    {option.hint && (
                      <p className="mt-1 text-xs text-slate-500">
                        {option.hint}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Reason details */}
          <div>
            <label
              htmlFor="reasonText"
              className="text-sm font-medium text-slate-900"
            >
              Tell us more
            </label>
            <p className="mt-1 text-xs text-slate-500">
              This helps us review your request fairly. Minimum{" "}
              {MIN_REASON_TEXT} characters.
            </p>
            <textarea
              id="reasonText"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
              placeholder="What's happened? When did the issue start? What outcome are you hoping for?"
            />
            <p
              className={`mt-1 text-xs ${
                reasonText.length === 0
                  ? "text-slate-500"
                  : reasonTextValid
                    ? "text-green-600"
                    : "text-slate-500"
              }`}
            >
              {reasonText.trim().length} / {MIN_REASON_TEXT} characters
            </p>
          </div>

          {/* Live preview */}
          {reasonCategory && previewCents !== null && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-slate-600">
                If approved, your refund would be:
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                ~{formatAud(previewCents)}
              </p>
              {previewFloored && (
                <p className="mt-1 text-xs text-slate-500">
                  Based on time remaining + commission already paid to your
                  nanny. See the formula in our{" "}
                  <Link href="/terms" className="underline">
                    Terms
                  </Link>
                  .
                </p>
              )}
              {!previewFloored && (
                <p className="mt-1 text-xs text-slate-500">
                  Final amount is reviewed by our team and may differ slightly.
                </p>
              )}
            </div>
          )}

          {/* Acknowledgement */}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-slate-700">
              I understand my request will be reviewed manually and a response
              will be issued within 14 business days.
            </span>
          </label>

          <div className="flex gap-3 pt-2">
            <Button
              size="lg"
              className="flex-1 bg-violet-600 hover:bg-violet-700"
              disabled={!canSubmit}
              onClick={submit}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit request"
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => window.history.back()}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
