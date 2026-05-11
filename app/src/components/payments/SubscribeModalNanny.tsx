"use client";

/**
 * SubscribeModalNanny — nanny variant (S2).
 *
 * Sister to SubscribeModal (parent variant). Same trigger condition —
 * `family_has_access(childId)===false` on a development feed page —
 * but the conversion lever is fundamentally different: the nanny
 * cannot pay on the parent's behalf, so this modal arms her with a
 * shareable link she can send to the parent personally.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S2.
 *
 * Critical invariants:
 * - NEVER shows pricing.
 * - NEVER shows a self-subscribe CTA.
 * - Primary CTA is the share-link button (Web Share API + clipboard
 *   fallback).
 * - Copy is relational — parent + child first names both surfaced.
 *
 * The `shareUrl` + `shareText` arrive pre-generated from the parent
 * route which calls the S5 `createSubscribeInvite` server action.
 * This component is pure presentation.
 *
 * Banned terminology (memory: feedback_never_use_tracking_terminology):
 * - "track", "tracking", "tracked" — never appear in user copy.
 */

import { useRef } from "react";
import { Lock, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface SubscribeModalNannyProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /**
   * Called when the user dismisses via the X close, "Maybe later"
   * button, background click, or Escape key.
   */
  onClose: () => void;
  /** Child's first name — interpolated into heading. */
  childFirstName: string;
  /** Parent's first name. Falls back to "the parent" if absent. */
  parentFirstName?: string;
  /** Pre-generated `/subscribe-for/{token}` URL (from S5). */
  shareUrl: string;
  /** Pre-built share message text (from S5). */
  shareText: string;
}

export function SubscribeModalNanny({
  isOpen,
  onClose,
  childFirstName,
  parentFirstName,
  shareUrl,
  shareText,
}: SubscribeModalNannyProps) {
  const primaryCtaRef = useRef<HTMLButtonElement>(null);

  const parentRef = parentFirstName ?? "the parent";
  const ctaLabel = parentFirstName
    ? `Share link with ${parentFirstName}`
    : "Share link with the parent";

  const handleShare = async (): Promise<void> => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Baby Bloom",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (e: unknown) {
        // User cancelled the OS share sheet — do NOT fall through.
        if (e instanceof Error && e.name === "AbortError") return;
        // Other failure (NotAllowedError, share unsupported in
        // context, etc.) → clipboard fallback.
      }
    }
    await fallbackCopy();
  };

  const fallbackCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Clipboard blocked — silent. The user will retry via the
      // share button. No toast here; toast feedback is the parent
      // route's responsibility if desired.
    }
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md gap-0 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primaryCtaRef.current?.focus();
        }}
      >
        <DialogHeader className="space-y-4 p-6 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <Lock className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>
          <DialogTitle className="text-left text-2xl font-bold text-slate-900">
            {childFirstName}&apos;s family doesn&apos;t have an active
            subscription
          </DialogTitle>
          <DialogDescription className="text-left text-base text-slate-600">
            Share this link with {parentRef} so they can subscribe and you can
            keep supporting {childFirstName}&apos;s development.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col gap-2 p-6 pt-2 sm:flex-col sm:gap-2 sm:space-x-0">
          <Button
            ref={primaryCtaRef}
            size="lg"
            className="w-full bg-violet-600 hover:bg-violet-700"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {ctaLabel}
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
