"use client";

/**
 * SubscribeModal — parent variant (S1).
 *
 * Renders on top of /parent/development/{childId} when the family's
 * subscription has lapsed (`family_has_access(childId)===false`). The
 * parent route owns the open/close state + the every-page-load re-fire
 * logic per S1's AC-S1.3 — this component is the presentation layer only.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S1.
 *
 * Locked-in copy:
 * - Heading: "Continue following {child}'s development with {nanny}"
 * - Body branches by lapseReason (trial vs subscription).
 * - Primary CTA → /parent/subscribe?childId=…
 * - Secondary CTA: "Maybe later" (close).
 *
 * Banned terminology (memory: feedback_never_use_tracking_terminology):
 * - "track", "tracking", "tracked" — never appear in user copy.
 *
 * The post-launch v1.1 benefit-stats block (activity counts, EYLF-domain
 * % progress) plugs in here as a new optional prop + section. Not built
 * for launch.
 */

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type SubscribeModalLapseReason = "trial_ended" | "subscription_lapsed";

export interface SubscribeModalProps {
  /** Whether the modal is currently visible / open. */
  isOpen: boolean;
  /**
   * Called when the user dismisses via the X close, "Maybe later"
   * button, background click, or the Escape key (all four paths
   * funnel through Radix's `onOpenChange`).
   */
  onClose: () => void;
  /** Used to scope the Subscribe page back to this child. */
  childId: string;
  /** First name interpolated into the locked-in copy. */
  childFirstName: string;
  /** Nanny's first name. If absent, falls back to "with your nanny". */
  nannyFirstName?: string;
  /** Drives the body copy variant. */
  lapseReason: SubscribeModalLapseReason;
}

/**
 * Returns the body-copy variant for the given `reason`. Switch
 * statement with a `never` fallback so adding a new union member
 * is a compile-time error (typescript-reviewer H2).
 */
function getBodyCopy(
  reason: SubscribeModalLapseReason,
  childFirstName: string,
): string {
  switch (reason) {
    case "trial_ended":
      return `${childFirstName}'s trial has ended. Subscribe to keep adding to ${childFirstName}'s feed and using Katie's full support.`;
    case "subscription_lapsed":
      return `${childFirstName}'s subscription has lapsed. Subscribe to keep adding to ${childFirstName}'s feed and using Katie's full support.`;
    default: {
      const _exhaustive: never = reason;
      throw new Error(`Unhandled lapseReason: ${String(_exhaustive)}`);
    }
  }
}

export function SubscribeModal({
  isOpen,
  onClose,
  childId,
  childFirstName,
  nannyFirstName,
  lapseReason,
}: SubscribeModalProps) {
  const router = useRouter();
  const primaryCtaRef = useRef<HTMLButtonElement>(null);

  const headingSuffix = nannyFirstName
    ? `with ${nannyFirstName}`
    : "with your nanny";

  const bodyCopy = getBodyCopy(lapseReason, childFirstName);

  const handleSubscribeClick = (): void => {
    router.push(`/parent/subscribe?childId=${encodeURIComponent(childId)}`);
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md gap-0 p-0"
        onOpenAutoFocus={(e) => {
          // Send initial focus to the primary CTA rather than the X
          // close button (Radix default). Better UX for a soft-paywall
          // modal — the first thing announced is the call-to-action.
          e.preventDefault();
          primaryCtaRef.current?.focus();
        }}
      >
        <DialogHeader className="space-y-4 p-6 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <Lock className="h-6 w-6 text-violet-600" aria-hidden="true" />
          </div>
          <DialogTitle className="text-left text-2xl font-bold text-slate-900">
            Continue following {childFirstName}&apos;s development{" "}
            {headingSuffix}
          </DialogTitle>
          <DialogDescription className="text-left text-base text-slate-600">
            {bodyCopy}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col gap-2 p-6 pt-2 sm:flex-col sm:gap-2 sm:space-x-0">
          <Button
            ref={primaryCtaRef}
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={handleSubscribeClick}
          >
            See subscription options
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full text-slate-600 hover:text-slate-900"
            onClick={onClose}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
