"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { PayoutOnboardingEmbedded } from "@/components/payments/PayoutOnboardingEmbedded";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatABNDisplay, isValidABN, normaliseABN } from "@/lib/payments/abn";
import {
  isPayoutVerified,
  toPayoutApplicationStatus,
  type PayoutApplicationStatus,
} from "@/lib/payments/payout-application-status";

interface Props {
  status: PayoutApplicationStatus;
  email: string | null;
  bankSummary: { last4: string | null; bankName: string | null } | null;
  /** When true, skip the page-level back link + outer container.
   *  Used when the view is rendered inside the settings tree, which
   *  supplies its own breadcrumb navigation. */
  embedded?: boolean;
}

type StatusPill = { label: string; tone: "amber" | "emerald" | "red" } | null;

function pillForStatus(status: PayoutApplicationStatus): StatusPill {
  switch (status) {
    case "verified":
    case "approved":
      return { label: "Active", tone: "emerald" };
    case "pending":
    case "pending_review":
      return { label: "Under review", tone: "amber" };
    case "in_progress":
      return { label: "In progress", tone: "amber" };
    case "restricted":
    case "requires_action":
      return { label: "Action needed", tone: "amber" };
    case "rejected":
      return { label: "Not approved", tone: "red" };
    default:
      return null;
  }
}

const PILL_TONES: Record<NonNullable<StatusPill>["tone"], string> = {
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-800",
};

function StatusPillRender({ pill }: { pill: StatusPill }) {
  if (!pill) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_TONES[pill.tone]}`}
    >
      {pill.label}
    </span>
  );
}

const STEPS: ReadonlyArray<string> = [
  "Confirm your information",
  "Add the account details you wish to be paid into",
  "Verify your ID",
  "Lock in your payouts",
];

export function PayoutOnboardingPageClient({
  status: initialStatus,
  email,
  bankSummary,
  embedded = false,
}: Props) {
  // Live status — initialised from the server, kept in sync via the
  // polling effect below so we can detect the moment Stripe flips the
  // nanny to "verified" and animate the page over.
  const [status, setStatus] = useState<PayoutApplicationStatus>(initialStatus);

  // ABN gate (2026-05-18): before the very first setup the nanny must
  // enter her ABN AND click Save. Only after that does the "Set Up
  // Contributions" CTA enable. Saved value is passed to Stripe at
  // account creation so the embed doesn't re-ask. Only relevant
  // pre-account-creation (status === 'not_applied'); once an account
  // exists this is moot — Stripe holds the value.
  const needsAbnGate = status === "not_applied";
  const [abnDraft, setAbnDraft] = useState("");
  const [savedAbn, setSavedAbn] = useState<string | null>(null);
  const abnGateSatisfied = !needsAbnGate || savedAbn !== null;

  // Two display modes:
  //   - "setup": process info + "Set up my payouts" CTA + (initially
  //     closed) accordion containing the Stripe embed
  //   - "verified": confirmation card + (initially closed) "Edit
  //     payouts" accordion
  // A brief "just_completed" intermediate sub-state shows a green
  // "Completed ✓" pill on the setup accordion for 2.5s before
  // swapping to the verified view.
  const verified = isPayoutVerified(status);
  const [justCompleted, setJustCompleted] = useState(false);
  const wasVerifiedRef = useRef(verified);

  const [setupOpen, setSetupOpen] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState<string[]>([]);

  // Detect non-verified → verified transitions inside the session and
  // run the post-completion celebration before swapping views.
  useEffect(() => {
    if (verified && !wasVerifiedRef.current) {
      setJustCompleted(true);
      setSetupOpen([]); // collapse the setup accordion
      const t = setTimeout(() => setJustCompleted(false), 2500);
      wasVerifiedRef.current = true;
      return () => clearTimeout(t);
    }
    wasVerifiedRef.current = verified;
    return undefined;
  }, [verified]);

  // Poll for status updates while the user is on the setup view.
  // Stops as soon as the verified state is reached. After
  // POLL_FAILURE_THRESHOLD consecutive errors, surface an inline
  // notice instead of silently spinning — protects against the case
  // where the polling endpoint is down + the nanny is stuck on the
  // setup view despite Stripe having already verified them.
  const POLL_FAILURE_THRESHOLD = 5;
  const pollFailureCount = useRef(0);
  const [pollUnavailable, setPollUnavailable] = useState(false);
  useEffect(() => {
    if (verified) return undefined;
    let cancelled = false;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch("/api/nanny/payout-status", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const json = (await res.json()) as { status: string };
        const next = toPayoutApplicationStatus(json.status);
        pollFailureCount.current = 0;
        if (pollUnavailable) setPollUnavailable(false);
        if (!cancelled && next !== status) {
          setStatus(next);
        }
      } catch (err) {
        pollFailureCount.current += 1;
        console.warn(
          `[payout-onboarding] status poll failed (${pollFailureCount.current}/${POLL_FAILURE_THRESHOLD})`,
          err,
        );
        if (
          !cancelled &&
          pollFailureCount.current >= POLL_FAILURE_THRESHOLD &&
          !pollUnavailable
        ) {
          setPollUnavailable(true);
        }
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [verified, status, pollUnavailable]);

  const pill = pillForStatus(status);

  return (
    <div
      className={embedded ? "" : "mx-auto max-w-2xl px-0 pb-12 pt-4 sm:px-4"}
    >
      {!embedded && (
        <Link
          href="/nanny/payouts"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to contributions
        </Link>
      )}

      <div
        className={`${embedded ? "" : "mt-6"} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm`}
      >
        <div className="space-y-5 px-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {verified ? "Contribution settings" : "Set up contributions"}
              </h1>
              {!verified && (
                <p className="mt-1 text-sm text-slate-600">
                  To make sure our contributions reach you, we first need to
                  confirm your accounts and identity line up.
                </p>
              )}
            </div>
            <StatusPillRender pill={pill} />
          </div>

          {verified ? (
            <VerifiedBlock email={email} bankSummary={bankSummary} />
          ) : status === "pending" || status === "pending_review" ? (
            <PendingBlock />
          ) : status === "rejected" ? (
            <RejectedBlock />
          ) : (
            <>
              <StepsTile />
              <WhatYoullNeed />
              {needsAbnGate && (
                <AbnGate
                  draft={abnDraft}
                  onChange={setAbnDraft}
                  saved={savedAbn}
                  onSave={(value) => setSavedAbn(value)}
                  onEdit={() => setSavedAbn(null)}
                />
              )}
            </>
          )}

          {pollUnavailable && !verified && (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900"
            >
              We can&apos;t reach the status check right now. If you&apos;ve
              just finished setup, refresh the page to see the latest state.
            </div>
          )}
        </div>

        {/* Accordion lives outside the inner-padded column so its
            content can bleed to the card edges — important for the
            Stripe embed which has an intrinsic min-width and would
            otherwise clip on narrow viewports. The trigger itself is
            styled as the page's primary CTA (no chevron, centered
            text). */}
        {!["pending", "pending_review", "rejected"].includes(status) && (
          <div className="mt-5 pb-4 sm:px-6 sm:pb-6">
            <PayoutsAccordion
              label={
                verified ? "Edit Contribution Details" : "Set Up Contributions"
              }
              open={verified ? editOpen : setupOpen}
              onOpenChange={verified ? setEditOpen : setSetupOpen}
              completedPill={justCompleted}
              disabled={!abnGateSatisfied}
              disabledHint="Enter your ABN above and click Save to continue"
              abn={needsAbnGate ? (savedAbn ?? undefined) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StepsTile() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Steps
      </p>
      <ol className="space-y-2">
        {STEPS.map((label, idx) => (
          <li key={label} className="flex items-start gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700">
              {idx + 1}
            </span>
            <span className="pt-0.5 text-slate-800">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WhatYoullNeed() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        What you&apos;ll need
      </p>
      <ul
        className="space-y-1.5 pl-5 text-sm text-slate-800"
        style={{ listStyleType: "disc" }}
      >
        <li>Government-issued ID</li>
        <li>Account Number, BSB & ABN</li>
      </ul>
    </div>
  );
}

// ABN gate — shown before account creation. We pre-pass the value to
// Stripe at `accounts.create` so the embed never has to ask for it.
// "Apply here" link covers nannies who don't have one yet.
const ABR_APPLY_URL =
  "https://www.abr.gov.au/business-super-funds-charities/applying-abn";

function AbnGate({
  draft,
  onChange,
  saved,
  onSave,
  onEdit,
}: {
  draft: string;
  onChange: (next: string) => void;
  saved: string | null;
  onSave: (value: string) => void;
  onEdit: () => void;
}) {
  // Let users type spaces freely. We store raw input + normalise
  // only for validation. On blur (or when they hit 11 digits) we
  // pretty-format to "XX XXX XXX XXX".
  function handleChange(value: string) {
    if (value.length > 16) return;
    const cleaned = value.replace(/[^\d ]/g, "");
    const digitCount = cleaned.replace(/\D/g, "").length;
    if (digitCount > 11) {
      onChange(formatABNDisplay(cleaned));
      return;
    }
    onChange(cleaned);
  }

  function handleBlur() {
    const digits = normaliseABN(draft);
    if (digits.length === 11) {
      onChange(formatABNDisplay(digits));
    }
  }

  function handleSave() {
    const digits = normaliseABN(draft);
    if (!isValidABN(digits)) return;
    onSave(digits);
  }

  const digitCount = normaliseABN(draft).length;
  const draftValid = isValidABN(draft);
  const showTooShortHint = digitCount > 0 && digitCount < 11;
  const showChecksumError = digitCount === 11 && !draftValid;

  // Saved state — read-only confirmation tile with an Edit button.
  if (saved !== null) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
          Your ABN
        </p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-mono text-sm font-medium">
              {formatABNDisplay(saved)}
            </span>
            <span className="text-xs">Saved</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange(formatABNDisplay(saved));
              onEdit();
            }}
          >
            Edit
          </Button>
        </div>
      </div>
    );
  }

  // Pre-save state — input + Save button.
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-700">
        Your ABN
      </p>
      <p className="mb-3 text-sm text-slate-700">
        Required before we can set up your contributions. 11 digits — for
        example, <span className="font-mono">51 824 753 556</span>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex-1">
          <Input
            id="abn-gate-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="XX XXX XXX XXX"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            aria-invalid={showChecksumError}
            aria-describedby={
              showChecksumError
                ? "abn-gate-error"
                : showTooShortHint
                  ? "abn-gate-progress"
                  : "abn-gate-help"
            }
            className="w-full bg-white font-mono"
          />
        </div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!draftValid}
          className="sm:flex-shrink-0"
        >
          Save ABN
        </Button>
      </div>
      {showChecksumError ? (
        <p
          id="abn-gate-error"
          role="alert"
          className="mt-1.5 text-xs text-rose-700"
        >
          That doesn&apos;t look like a valid ABN. Please double-check the
          digits — a valid ABN looks like{" "}
          <span className="font-mono">51 824 753 556</span>.
        </p>
      ) : showTooShortHint ? (
        <p
          id="abn-gate-progress"
          className="mt-1.5 text-xs text-slate-600"
          aria-live="polite"
        >
          {11 - digitCount} more digit{11 - digitCount === 1 ? "" : "s"} to go.
        </p>
      ) : (
        <p id="abn-gate-help" className="mt-1.5 text-xs text-slate-600">
          Don&apos;t have an ABN yet?{" "}
          <a
            href={ABR_APPLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
          >
            Apply here
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>{" "}
          — it takes less than 5 minutes.
        </p>
      )}
    </div>
  );
}

function PayoutsAccordion({
  label,
  open,
  onOpenChange,
  completedPill,
  disabled = false,
  disabledHint,
  abn,
}: {
  label: string;
  open: string[];
  onOpenChange: (v: string[]) => void;
  completedPill: boolean;
  disabled?: boolean;
  disabledHint?: string;
  abn?: string;
}) {
  // When disabled, force the accordion closed and intercept clicks so
  // the embed doesn't load before the ABN gate is satisfied.
  const effectiveOpen = disabled ? [] : open;
  const handleChange = (v: string[]) => {
    if (disabled) return;
    onOpenChange(v);
  };
  return (
    <Accordion
      type="multiple"
      value={effectiveOpen}
      onValueChange={handleChange}
      className="w-full"
    >
      <AccordionItem value="setup" className="border-0">
        {/* Trigger doubles as the page CTA. Chevron hidden via
            `[&>svg]:hidden`; text centered; violet primary-button
            styling. Switches to the emerald "Completed" treatment
            during the post-onboarding celebration window. Wrapped
            in `mx-3 sm:mx-0` so the button has visual breathing
            room on mobile while the content below stays full-bleed. */}
        <div className="mx-3 sm:mx-0">
          <AccordionTrigger
            aria-disabled={disabled}
            title={disabled ? disabledHint : undefined}
            className={`flex h-12 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 [&>svg]:hidden ${
              disabled
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : completedPill
                  ? "bg-emerald-600 text-white hover:bg-emerald-600"
                  : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {completedPill ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Completed
              </span>
            ) : (
              <span>{label}</span>
            )}
          </AccordionTrigger>
        </div>
        {/* Content sits OUTSIDE the trigger's mx-3 wrapper so it
            inherits the full accordion width (which equals the card
            width on mobile via px-0 page wrapper). Embed gets the
            maximum possible space without escaping the card.
            Bailey 2026-05-13 width fix v5. */}
        <AccordionContent className="overflow-x-auto px-2 pt-3 sm:px-0">
          <PayoutOnboardingEmbedded abn={abn} />
          <p className="mt-4 px-2 text-center text-xs text-slate-500 sm:px-0">
            Your information is handled by Stripe, our payment partner trusted
            by businesses worldwide.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function PendingBlock() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5 sm:py-4"
    >
      <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">We&apos;re reviewing your details.</p>
        <p className="mt-1">
          Usually 1&ndash;2 business days. We&apos;ll email you the moment
          payouts are active.
        </p>
      </div>
    </div>
  );
}

function RejectedBlock() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:px-5 sm:py-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">
          We couldn&apos;t get your account approved.
        </p>
        <p className="mt-1">
          Please{" "}
          <Link
            href="/contact"
            className="font-medium underline-offset-2 hover:underline"
          >
            contact us
          </Link>{" "}
          and we&apos;ll work it out with you.
        </p>
      </div>
    </div>
  );
}

function VerifiedBlock({
  email,
  bankSummary,
}: {
  email: string | null;
  bankSummary: { last4: string | null; bankName: string | null } | null;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2
            className="h-5 w-5 text-emerald-700"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-900">
            Payouts are active.
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            We&apos;ll transfer earnings to your connected bank automatically.
          </p>
        </div>
      </div>
      <dl className="space-y-2 border-t border-emerald-200/70 pt-3 text-sm">
        <div className="flex items-start gap-3">
          <Wallet
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          <div className="flex-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Bank account
            </dt>
            <dd className="text-slate-900">
              {bankSummary?.bankName ? `${bankSummary.bankName} ` : ""}
              {bankSummary?.last4
                ? `account ending in ${bankSummary.last4}`
                : "Connected"}
            </dd>
          </div>
        </div>
        {email && (
          <div className="ml-7">
            <dt className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Notifications email
            </dt>
            <dd className="text-slate-900">{email}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
