"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPortalSession } from "@/lib/actions/payments/portal";

interface SubscriptionRow {
  status:
    | "trial"
    | "active_monthly"
    | "active_upfront"
    | "past_due"
    | "cancelled"
    | "lapsed"
    | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  paid_period_starts_at?: string | null;
  paid_period_ends_at?: string | null;
  past_due_grace_ends_at?: string | null;
  cancelled_at?: string | null;
  has_used_trial?: boolean | null;
}

interface SubscriptionClientProps {
  subscription: SubscriptionRow | null;
  /**
   * `true` when the user just returned from Stripe Checkout with
   * `?status=success` on the URL. Drives the conversion-celebration
   * banner + the post-checkout `router.refresh()` loop that pulls
   * the new subscription state once the webhook lands.
   */
  justSubscribed?: boolean;
  childFirstName?: string | null;
  nannyFirstName?: string | null;
}

const STATUS_LABELS: Record<NonNullable<SubscriptionRow["status"]>, string> = {
  trial: "Free trial",
  active_monthly: "Active monthly",
  active_upfront: "Active upfront",
  past_due: "Payment past due",
  cancelled: "Cancelled — access until period end",
  lapsed: "Lapsed",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function SubscriptionClient({
  subscription,
  justSubscribed,
  childFirstName,
  nannyFirstName,
}: SubscriptionClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // UX-FIX-PLAN FIX-5 — Checkout return celebration.
  //
  // Stripe redirects the parent to /parent/subscription?status=success
  // 0–2 seconds before the webhook actually lands and flips the row
  // to active_*. Without intervention the page renders stale state
  // (still "lapsed" or "trial") and the parent thinks payment didn't
  // go through. We:
  //   1. Show a celebration banner immediately based on the URL signal
  //      (cheap, optimistic — Stripe redirects only on actual success).
  //   2. Poll `router.refresh()` every 1.5s until the subscription
  //      row reports an active status, OR for 4 cycles (failsafe).
  //   3. The banner stays visible after the active status arrives.
  const [showCelebration, setShowCelebration] = useState<boolean>(
    Boolean(justSubscribed),
  );
  const refreshTickCountRef = useRef<number>(0);
  useEffect(() => {
    if (!justSubscribed) return;
    if (
      subscription?.status === "active_monthly" ||
      subscription?.status === "active_upfront"
    ) {
      // Already landed — no polling needed.
      return;
    }
    if (refreshTickCountRef.current >= 4) return;
    const timer = setTimeout(() => {
      refreshTickCountRef.current += 1;
      router.refresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [justSubscribed, subscription?.status, router]);

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const result = await createPortalSession();
      if (!result.success || !result.data) {
        setError(result.error ?? "Couldn't open the subscription portal.");
        return;
      }
      // Open in same tab — Stripe portal handles its own session.
      window.location.href = result.data.url;
    });
  }

  // No subscription row → never subscribed → drop them on the subscribe page.
  if (!subscription || !subscription.status) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold text-slate-900">
          You don&apos;t have a subscription yet
        </h1>
        <p className="mt-2 text-slate-600">
          Start a 30-day free trial to track your child&apos;s development.
        </p>
        <Button
          size="lg"
          className="mt-6 bg-violet-600 hover:bg-violet-700"
          onClick={() => router.push("/parent/subscribe")}
        >
          Subscribe
        </Button>
      </div>
    );
  }

  const status = subscription.status;

  // Period-end string varies by status.
  const accessEndsAt =
    status === "trial"
      ? subscription.trial_ends_at
      : status === "past_due"
        ? subscription.past_due_grace_ends_at
        : subscription.paid_period_ends_at;

  // Celebration banner copy — uses interpolated names when available;
  // falls back to generic per COPY-AND-FRAMING.md cross-section rules.
  const childRef = childFirstName ?? "your child";
  const nannyRef = nannyFirstName ? ` and ${nannyFirstName}` : "";
  const stateConfirmed =
    subscription?.status === "active_monthly" ||
    subscription?.status === "active_upfront";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your Baby Bloom subscription.
      </p>

      {showCelebration && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            {stateConfirmed ? (
              <CheckCircle2
                className="h-5 w-5 text-emerald-700"
                aria-hidden="true"
              />
            ) : (
              <Sparkles
                className="h-5 w-5 text-emerald-700 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              {stateConfirmed
                ? `You're in. Welcome to Baby Bloom for ${childRef}.`
                : `Activating your subscription for ${childRef}…`}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {stateConfirmed
                ? `A$100 of every payment supports ${childRef}'s development${nannyRef}.`
                : `Stripe is confirming payment. This usually takes a few seconds.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setShowCelebration(false)}
            className="shrink-0 rounded-md p-1 text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
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

      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current plan
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {STATUS_LABELS[status]}
              </p>
            </div>
            {(status === "active_monthly" ||
              status === "active_upfront" ||
              status === "trial") && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                Active
              </span>
            )}
            {status === "past_due" && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                Action needed
              </span>
            )}
            {(status === "cancelled" || status === "lapsed") && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Inactive
              </span>
            )}
          </div>

          {accessEndsAt && (
            <p className="mt-4 text-sm text-slate-600">
              {status === "trial"
                ? "Trial ends"
                : status === "past_due"
                  ? "Update your card by"
                  : status === "cancelled"
                    ? "Access until"
                    : "Next charge / renewal"}
              :{" "}
              <strong className="text-slate-900">
                {formatDate(accessEndsAt)}
              </strong>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-3">
        {(status === "active_monthly" || status === "active_upfront") && (
          <>
            {/* Cancel routes to our own reason-capture flow (S9), NOT
                the Stripe Customer Portal. Spec § "Customer Portal —
                when we use it" — Portal is for card updates only. */}
            <Button
              size="lg"
              className="w-full justify-center bg-violet-600 hover:bg-violet-700"
              onClick={() => router.push("/parent/subscription/cancel")}
            >
              Cancel subscription
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full justify-center"
              disabled={isPending}
              onClick={openPortal}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Update payment method <ExternalLink className="h-4 w-4" />
                </>
              )}
            </Button>
          </>
        )}

        {status === "past_due" && (
          <Button
            size="lg"
            className="w-full justify-center bg-violet-600 hover:bg-violet-700"
            disabled={isPending}
            onClick={openPortal}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Update payment method <ExternalLink className="h-4 w-4" />
              </>
            )}
          </Button>
        )}

        {(status === "cancelled" || status === "lapsed") && (
          <Button
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={() => router.push("/parent/subscribe")}
          >
            Subscribe
          </Button>
        )}

        {status === "trial" && (
          <Button
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={() => router.push("/parent/subscribe")}
          >
            Choose a paid plan
          </Button>
        )}
      </div>

      {(status === "active_monthly" || status === "active_upfront") && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p>
            Looking for a refund?{" "}
            <Link
              href="/contact"
              className="font-medium text-violet-700 underline-offset-2 hover:underline"
            >
              Get in touch
            </Link>{" "}
            and tell us what&apos;s going on. We review every request
            individually and respond within 14 business days.
          </p>
        </div>
      )}

      <div className="mt-10 border-t border-slate-200 pt-6">
        <Link
          href="/parent"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
