"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, X, Share2 } from "lucide-react";
import { revokeChildInvite } from "@/lib/actions/bapp/child-invites";

interface InviteBannerProps {
  childId: string;
  childFirstName: string;
  inviteUrl: string;
  role: "nanny" | "parent";
}

function focusMainContent() {
  // Send focus to <main> after the banner unmounts so a keyboard / SR
  // user lands somewhere sensible instead of <body>. Falls back to
  // first heading if no <main> exists.
  if (typeof document === "undefined") return;
  const main = document.querySelector<HTMLElement>("main");
  const target =
    main ?? document.querySelector<HTMLElement>("h1, h2, [role='heading']");
  if (target) {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  }
}

/**
 * Sticky invite banner shown on the creator's child layout while the
 * other party is still missing.
 *
 * Behavioural difference per `05-ui-surfaces.md §5`:
 * - Nanny side (parent missing): non-dismissible. Persists until the
 *   parent connects — the nanny can't accidentally bury the prompt.
 * - Parent side (nanny missing): dismissible per session. Renders again
 *   next session if still no nanny.
 *
 * Token-stability policy: kebab menu has only "Revoke link". Regenerate
 * was removed — see `project_invite_token_stability.md`.
 */
export function InviteBanner({
  childId,
  childFirstName,
  inviteUrl,
  role,
}: InviteBannerProps) {
  const router = useRouter();
  const headingId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  if (dismissed) return null;

  const headline =
    role === "nanny"
      ? `Send ${childFirstName}'s parent an invite`
      : `Send ${childFirstName}'s nanny an invite`;

  async function fallbackCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setFeedback("Link copied");
      setTimeout(() => setFeedback(null), 2500);
    } catch {
      setError("Couldn't copy. Long-press the link to copy manually.");
    }
  }

  async function handleShare() {
    setError(null);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Baby Bloom invite",
          text: `Join me on Baby Bloom for ${childFirstName}`,
          url: inviteUrl,
        });
        // Successful share — OS dismisses the sheet, no inline feedback needed.
        return;
      } catch (e: unknown) {
        // User cancelled the share sheet — do NOT fall through to copy.
        if (e instanceof Error && e.name === "AbortError") return;
        // Other errors (NotAllowedError, share unsupported in context) → fall back.
        await fallbackCopy();
        return;
      }
    }
    await fallbackCopy();
  }

  async function handleRevoke() {
    setBusy(true);
    setError(null);
    const result = await revokeChildInvite(childId);
    if (!result.success) {
      setError(
        result.error === "not_creator"
          ? "Only the person who created the invite can revoke it."
          : "Couldn't revoke. Please try again.",
      );
      setBusy(false);
      return;
    }
    setBusy(false);
    // Refresh the layout so the banner disappears (the parent layout's
    // server fetch will return null for the now-revoked invite).
    router.refresh();
  }

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="sticky top-0 z-30 border-b border-violet-200 bg-violet-50 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p
          id={headingId}
          className="text-sm font-medium text-violet-900"
          // The banner is a notice, not a section heading — labelling
          // the region with a paragraph keeps the document outline of
          // the underlying child layout intact (a11y review HIGH).
        >
          {headline}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleShare}
            disabled={busy}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <Share2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Share invite
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More options"
                disabled={busy}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setConfirmingRevoke(true)}
                className="text-red-600 focus:text-red-700"
              >
                Revoke link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {role === "parent" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss"
              onClick={() => {
                setDismissed(true);
                // Focus management — without this, dismissing leaves
                // focus on <body> and a keyboard / SR user is lost.
                focusMainContent();
              }}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {/* Inline destructive-action confirmation. Keyboard users land
          on Revoke link → Enter → here, where they get a deliberate
          two-tap pattern instead of a one-shot destructive default
          (a11y review SC 3.3.4). */}
      {confirmingRevoke && (
        <div
          className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2"
          role="alertdialog"
          aria-labelledby={`${headingId}-confirm`}
        >
          <p id={`${headingId}-confirm`} className="text-xs text-red-800">
            Revoke this link? Anyone who already has it will see &ldquo;no
            longer active&rdquo;.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRevoke(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRevoke}
              disabled={busy}
            >
              {busy ? "Revoking..." : "Revoke"}
            </Button>
          </div>
        </div>
      )}
      {feedback && (
        <p
          className="mt-1 text-xs text-emerald-800"
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
