"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsentCheckbox } from "@/components/legal/ConsentCheckbox";
import { PolicyContent } from "@/components/legal/PolicyContent";
import {
  renewChildConsent,
  declineParentConsentAndDeleteChild,
  declineNannyConsentAndUnlink,
} from "@/lib/legal/consent-renewal";

/**
 * Pops up on the child's dev page when the user's consent is within
 * 7 days of expiry. Two paths:
 *  - Renew (auto-ticked checkbox + button) → records a fresh consent
 *    row, resets the 12-month TTL.
 *  - Decline → two-step confirm. Parent decline: deletes the child +
 *    cancels sub. Nanny decline: unlinks the nanny.
 *
 * Bailey 2026-05-14 product call.
 */
export interface ConsentRenewalModalProps {
  childId: string;
  childFirstName: string;
  role: "parent" | "nanny";
  /** ISO timestamp of when consent expires. Used for "Expires in X days". */
  expiresAt: string;
}

export function ConsentRenewalModal({
  childId,
  childFirstName,
  role,
  expiresAt,
}: ConsentRenewalModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [consented, setConsented] = useState(true);
  const [view, setView] = useState<"initial" | "confirm-decline">("initial");
  const [error, setError] = useState<string | null>(null);

  const agreementId =
    role === "parent" ? "PARENT-APP-CONSENT" : "NANNY-ATTESTATION";
  const policySlug =
    role === "parent" ? "parent-app-consent" : "nanny-attestation";
  const daysToExpiry = Math.max(
    0,
    Math.ceil(
      (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
  );

  function handleRenew(): void {
    if (!consented) return;
    setError(null);
    startTransition(async () => {
      const result = await renewChildConsent({ childId, agreementId });
      if (!result.success) {
        setError(result.error ?? "Renewal failed. Please try again.");
        return;
      }
      router.refresh();
    });
  }

  function handleConfirmDecline(): void {
    setError(null);
    startTransition(async () => {
      const result =
        role === "parent"
          ? await declineParentConsentAndDeleteChild({ childId })
          : await declineNannyConsentAndUnlink({ childId });
      if (!result.success) {
        setError(result.error ?? "Couldn't process. Please try again.");
        return;
      }
      // Both paths route away — parent has no child left to view,
      // nanny no longer has access.
      router.push(role === "parent" ? "/parent" : "/nanny");
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="renewal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 px-4 py-8 sm:items-center"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        {view === "initial" ? (
          <>
            <div className="border-b border-slate-200 bg-amber-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                <div>
                  <h2
                    id="renewal-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Annual re-consent for {childFirstName}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-700">
                    Your consent expires in {daysToExpiry} day
                    {daysToExpiry === 1 ? "" : "s"}. Confirm to keep using Baby
                    Bloom for this child.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 px-5 py-4">
              <PolicyContent slug={policySlug} />
              <ConsentCheckbox
                label={
                  role === "parent"
                    ? "I consent to continue for another 12 months."
                    : "I agree to continue my professional engagement for another 12 months."
                }
                description="Untick to decline. Declining will remove access (see below)."
                defaultConsented={true}
                onConsentChange={setConsented}
              />
              {error && (
                <p
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row-reverse">
              <Button
                onClick={handleRenew}
                disabled={!consented || isPending}
                className="flex-1 bg-violet-600 hover:bg-violet-700"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Renewing…
                  </>
                ) : (
                  "Confirm consent + continue"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setView("confirm-decline")}
                disabled={isPending}
                className="flex-1"
              >
                Decline
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-200 bg-red-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Are you sure?
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-700">
                    {role === "parent"
                      ? `This will permanently delete ${childFirstName} and all their history from Baby Bloom, and cancel any active subscription. This cannot be undone.`
                      : `This will remove you from ${childFirstName}. You will lose access to their development record. The parent keeps everything.`}
                  </p>
                </div>
              </div>
            </div>
            {error && (
              <p
                className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row-reverse">
              <Button
                variant="destructive"
                onClick={handleConfirmDecline}
                disabled={isPending}
                className="flex-1"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : role === "parent" ? (
                  "Yes, delete + cancel"
                ) : (
                  "Yes, remove me"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setView("initial")}
                disabled={isPending}
                className="flex-1"
              >
                Back
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
