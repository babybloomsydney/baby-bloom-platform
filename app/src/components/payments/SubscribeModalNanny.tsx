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

import { useRef, useState } from "react";
import { AlertCircle, Lock, Share2 } from "lucide-react";
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
  // Surfaces when both navigator.share AND clipboard fail — non-HTTPS
  // contexts, hardened mobile browsers, permission-denied. Falling
  // through silently leaves the nanny tapping a dead button; the inline
  // fallback gives her something selectable to copy by hand.
  const [shareError, setShareError] = useState<boolean>(false);

  const parentRef = parentFirstName ?? "the parent";
  const ctaLabel = parentFirstName
    ? `Share link with ${parentFirstName}`
    : "Share link with the parent";

  const performShare = async (): Promise<void> => {
    setShareError(false);
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
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      setShareError(true);
    }
  };

  // React onClick expects a sync handler — wrap so the floating
  // Promise from `performShare` is captured (via `void`) instead of
  // unhandled. Without this, an exception inside performShare would
  // turn into a global unhandled-rejection.
  const handleShareClick = (): void => {
    void performShare();
  };

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      // Reset transient share-error state so a re-open of the modal
      // doesn't show a stale alert from a previous attempt.
      setShareError(false);
      onClose();
    }
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
            onClick={handleShareClick}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {ctaLabel}
          </Button>
          {shareError && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Couldn&apos;t open share or copy automatically. Select + copy
                  the link below.
                </span>
              </div>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-amber-200 bg-white px-2 py-1 font-mono text-xs text-slate-700"
              />
            </div>
          )}
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
