"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ExternalLink,
  Heart,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPortalSession } from "@/lib/actions/payments/portal";
import { formatAuDate } from "@/lib/format/date";

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
   * `true` when the user just returned from Checkout with
   * `?status=success` on the URL. Drives the full-page activation
   * overlay + the post-checkout `router.refresh()` loop that pulls
   * the new subscription state once the webhook lands, then
   * redirects the parent to the child's development page.
   */
  justSubscribed?: boolean;
  /** Used for the auto-redirect target after activation confirms. */
  childId?: string | null;
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

export function SubscriptionClient({
  subscription,
  justSubscribed,
  childId,
  childFirstName,
  nannyFirstName,
}: SubscriptionClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Post-checkout activation overlay (Bailey 2026-05-13 rework). When
  // the parent returns from Checkout with ?status=success:
  //   1. Render a full-page activation screen (NOT the management
  //      page) so the parent sees nothing but the conversion moment.
  //   2. Poll `router.refresh()` every 1.5s until the subscription
  //      row reports active_* (or 8 cycles ≈ 12s failsafe).
  //   3. Once confirmed, show a congrats message + auto-redirect to
  //      the child's development page after 2s.
  // No "Stripe" wording anywhere — implementation detail, not user
  // concern.
  const refreshTickCountRef = useRef<number>(0);
  const stateConfirmed =
    subscription?.status === "active_monthly" ||
    subscription?.status === "active_upfront";

  useEffect(() => {
    if (!justSubscribed) return;
    if (stateConfirmed) return; // landed; no more polling needed
    if (refreshTickCountRef.current >= 8) return;
    const timer = setTimeout(() => {
      refreshTickCountRef.current += 1;
      router.refresh();
    }, 1500);
    return () => clearTimeout(timer);
  }, [justSubscribed, stateConfirmed, router]);

  // Auto-redirect to the child's dev page once activation is confirmed.
  useEffect(() => {
    if (!justSubscribed || !stateConfirmed || !childId) return;
    const timer = setTimeout(() => {
      router.push(`/parent/development/${childId}`);
    }, 2000);
    return () => clearTimeout(timer);
  }, [justSubscribed, stateConfirmed, childId, router]);

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

  // Full-page activation overlay — wins over everything else when the
  // parent has just returned from Checkout. Renders a clean loading
  // screen that resolves into a congrats moment and auto-redirects
  // to the child's dev page. The management surface below is never
  // rendered in this state.
  if (justSubscribed) {
    return (
      <ActivationOverlay
        stateConfirmed={stateConfirmed}
        childFirstName={childFirstName ?? "your child"}
        nannyFirstName={nannyFirstName ?? null}
        willRedirect={Boolean(childId)}
      />
    );
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Subscription</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your subscription helps us contribute to the developmental work your
        nanny is doing — we&apos;re all on the same team, working towards the
        betterment of young children.
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
                {formatAuDate(accessEndsAt)}
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

        {(status === "trial" ||
          status === "cancelled" ||
          status === "lapsed") && (
          <Button
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={() => router.push("/parent/subscribe")}
          >
            Continue Development
          </Button>
        )}
      </div>

      {/* Refund copy intentionally removed per DSS §3.1 + §8 Q5
          (Bailey 2026-05-12). Users who want to discuss billing
          navigate to /contact themselves; the product never invites
          the thought. Legal pages retain the statutory ACL refund
          clauses (different surface, different audience). */}

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

/** Full-page post-checkout activation screen. Two states:
 *    - pending: spinner + "Setting up {child}'s development" copy.
 *    - confirmed: heart icon + "You're in" + auto-redirect notice.
 *  No mention of Stripe / payment processor — implementation detail
 *  that doesn't belong in user-facing copy (Bailey 2026-05-13). */
function ActivationOverlay({
  stateConfirmed,
  childFirstName,
  nannyFirstName,
  willRedirect,
}: {
  stateConfirmed: boolean;
  childFirstName: string;
  nannyFirstName: string | null;
  /** Auto-redirect only fires when a childId is known. When false,
   *  the confirmed-state copy reads as a final celebration without
   *  promising a redirect that will never happen. */
  willRedirect: boolean;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        {stateConfirmed ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Heart
                className="h-8 w-8 text-emerald-700"
                aria-hidden="true"
                fill="currentColor"
              />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              You&apos;re in.
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Welcome to Baby Bloom for {childFirstName}
              {nannyFirstName ? ` and ${nannyFirstName}` : ""}.
              {willRedirect
                ? ` We're taking you to ${childFirstName}'s development page now.`
                : ""}
            </p>
            {willRedirect && (
              <div
                role="status"
                aria-live="polite"
                className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Redirecting…
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
              <Sparkles
                className="h-8 w-8 text-violet-700 animate-pulse"
                aria-hidden="true"
              />
            </div>
            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              Setting up {childFirstName}&apos;s development
            </h1>
            <p className="mt-2 text-base text-slate-600">
              Just a few seconds — we&apos;ll have everything ready in a moment.
            </p>
            <div
              role="status"
              aria-live="polite"
              className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Activating
            </div>
          </>
        )}
      </div>
    </div>
  );
}
