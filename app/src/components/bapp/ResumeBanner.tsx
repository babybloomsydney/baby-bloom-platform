"use client";

/**
 * The "Continue setup with Katie" feed banner — A-08 spec § 'Resume
 * affordance' (L763-790).
 *
 * Renders when `bot.settings.onboarding_completed=false` AND
 * `onboarding_dismissed=false` AND there is at least one pending
 * topic. Visibility + copy are derived server-side by
 * `getOnboardingBannerStatus`; this component is a thin client
 * renderer over the resulting `BannerStatus`.
 *
 * Two interactions:
 *   - "Continue from where we left off" → switches the deck to Katie
 *     (via `KatieContext.showKatie()`). Katie's onboarding system
 *     prompt fragment + state-render block read `current_step` and
 *     `topics`, so when she next responds she picks up where she
 *     left off — no client-side message-injection needed.
 *   - "×" → fires `dismissOnboardingBanner` server-side (flips
 *     `onboarding_dismissed=true`) and hides the banner optimistically.
 *     If the server action fails, the banner re-appears so the user
 *     can retry.
 *
 * Accessibility:
 *   - `<section>` with `aria-labelledby` pointing at the visible
 *     headline so the accessible name matches `Label in Name` (SC 2.5.3).
 *   - Persistent `role="status" aria-live="polite"` span announces
 *     dismiss success/failure (SC 4.1.3).
 *   - 36×36 dismiss target (SC 2.5.8) with `focus-visible` ring (SC 2.4.11).
 *   - Decorative Sparkle marked `aria-hidden`.
 *
 * Anti-template: violet sparkle + slate body matches Baby Bloom's
 * existing palette (KatieNoteTile uses the same combo). No generic
 * "info banner" look.
 */

import { useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";
import {
  dismissOnboardingBanner,
  type BannerStatus,
} from "@/lib/actions/bapp/onboarding-banner";
import { useKatieOptional } from "@/contexts/KatieContext";

export type { BannerStatus };

const HEADLINE_ID = "resume-banner-headline";

export function ResumeBanner({ status }: { status: BannerStatus }) {
  const [hidden, setHidden] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();
  const katie = useKatieOptional();

  const handleContinue = () => {
    katie?.showKatie();
  };

  const handleDismiss = () => {
    // Optimistic hide — "Banner gone for good" UX shouldn't wait on
    // a server round-trip. We re-show on failure so the user lands
    // in a recoverable state, not a silent "looks dismissed but
    // isn't" state.
    setHidden(true);
    startTransition(async () => {
      try {
        const result = await dismissOnboardingBanner();
        if (!result.success) {
          setHidden(false);
          setAnnouncement("Could not dismiss banner. Please try again.");
          return;
        }
        setAnnouncement("Setup banner dismissed.");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[ResumeBanner] dismissOnboardingBanner threw:", message);
        setHidden(false);
        setAnnouncement("Could not dismiss banner. Please try again.");
      }
    });
  };

  const headline = status.hasCapturedTopics
    ? "Continue setup with Katie"
    : "Quick setup with Katie";

  const subline = status.hasCapturedTopics
    ? `${status.pendingCount} more thing${status.pendingCount === 1 ? "" : "s"} on offer: ${status.pendingTopicLabels.join(", ")}`
    : "Get the feed populated and meet Katie properly.";

  // The status span is rendered persistently (even when the banner
  // is hidden) so screen readers observe announcement mutations
  // through the dismiss flow.
  return (
    <>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {status.visible && !hidden ? (
        <section
          aria-labelledby={HEADLINE_ID}
          className="relative rounded-xl bg-gradient-to-br from-violet-50 to-white px-4 py-3 shadow-sm ring-1 ring-violet-500/30"
        >
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="absolute right-1 top-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex items-start gap-3 pr-10">
            <Sparkles
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600"
              aria-hidden="true"
            />
            <div className="flex-1 space-y-2">
              <div>
                <p
                  id={HEADLINE_ID}
                  className="text-sm font-semibold text-slate-900"
                >
                  {headline}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{subline}</p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              >
                Continue from where we left off
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
