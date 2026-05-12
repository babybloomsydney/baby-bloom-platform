"use client";

/**
 * TrialBanner — surfaces trial-active state across the parent shell.
 *
 * Spec source: COPY-AND-FRAMING.md § 3 (trial-end nudge sequence) +
 * 16-parent-user-journey.md (states 20 + trial reminders). UX-FIX-PLAN
 * FIX-3 (2026-05-12 audit) — the parent's day-to-day surface had no
 * trial status indicator before this banner; the only place trial
 * state was visible was the dedicated /parent/subscription page.
 *
 * Escalation rules (days remaining is `Math.ceil(diffMs / day)`):
 *   - > 7 days   → subtle slate "Trial active — X days remaining"
 *   - 3–7 days   → amber "Trial ends in X days — subscribe to keep [child]"
 *   - 1–2 days   → amber alert "Trial ends in X days — subscribe today"
 *   - 0 days     → red "Trial ends today — subscribe now"
 *
 * The CTA always navigates to `/parent/subscribe`. The banner is pure
 * presentation; the parent route decides WHEN to render (gated on
 * `subscription.status === 'trial'` with a valid `trial_ends_at`).
 *
 * Copy rules honoured (per COPY-AND-FRAMING.md cross-section
 * principles + memory `feedback_never_use_tracking_terminology`):
 *   - Specific day counts ("3 days" not "soon")
 *   - No "tracking" terminology
 *   - Reciprocity reminder appears only on subtle variant (>7d) — the
 *     amber + red variants stay terse so urgency reads cleanly.
 */

import { Sparkles, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TrialBannerProps {
  /** Days remaining in the trial. Computed by the parent route. */
  daysRemaining: number;
  /**
   * Optional child first name. When present, the amber/red variants
   * say "to keep [name]'s feed". When absent (e.g. on the hub where
   * the parent may have multiple children), copy uses generic
   * "your child's feed".
   */
  childFirstName?: string;
  /** Navigate to the subscribe page. */
  onPrimaryCta: () => void;
}

export function TrialBanner({
  daysRemaining,
  childFirstName,
  onPrimaryCta,
}: TrialBannerProps) {
  const childRef = childFirstName ? `${childFirstName}'s` : "your child's";

  // ── Tier 1: subtle (>7 days) ───────────────────────────────────────
  if (daysRemaining > 7) {
    return (
      <div
        role="status"
        className="flex w-full items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 sm:px-6"
      >
        <Sparkles
          className="h-4 w-4 shrink-0 text-violet-600"
          aria-hidden="true"
        />
        <p className="flex-1 text-sm text-slate-700">
          <span className="font-medium">Trial active</span> —{" "}
          <span className="text-slate-600">
            {daysRemaining} days remaining.
          </span>
        </p>
        <button
          type="button"
          onClick={onPrimaryCta}
          className="shrink-0 text-sm font-medium text-violet-700 hover:underline"
        >
          See plans
        </button>
      </div>
    );
  }

  // ── Tier 2: amber (3–7 days) ───────────────────────────────────────
  if (daysRemaining >= 3) {
    return (
      <div
        role="status"
        className="flex w-full items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6"
      >
        <AlertCircle
          className="h-4 w-4 shrink-0 text-amber-700"
          aria-hidden="true"
        />
        <p className="flex-1 text-sm text-amber-900">
          <span className="font-semibold">
            Trial ends in {daysRemaining} days.
          </span>{" "}
          Subscribe to keep following {childRef} development.
        </p>
        <Button
          size="sm"
          className="shrink-0 bg-violet-600 hover:bg-violet-700"
          onClick={onPrimaryCta}
        >
          Subscribe
        </Button>
      </div>
    );
  }

  // ── Tier 3: red (0–2 days) ─────────────────────────────────────────
  const heading =
    daysRemaining === 0
      ? "Trial ends today."
      : daysRemaining === 1
        ? "Trial ends tomorrow."
        : `Trial ends in ${daysRemaining} days.`;
  const cta = daysRemaining === 0 ? "Subscribe now" : "Subscribe";

  return (
    <div
      role="alert"
      className="flex w-full items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 sm:px-6"
    >
      <AlertTriangle
        className="h-4 w-4 shrink-0 text-red-700"
        aria-hidden="true"
      />
      <p className="flex-1 text-sm text-red-900">
        <span className="font-semibold">{heading}</span> Subscribe to keep{" "}
        {childRef} feed alive.
      </p>
      <Button
        size="sm"
        className="shrink-0 bg-violet-600 hover:bg-violet-700"
        onClick={onPrimaryCta}
      >
        {cta}
      </Button>
    </div>
  );
}
