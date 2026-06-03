"use client";

// T-032 — Original onboarding answers (collapsible accordion across N1 JSONB).

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";

interface LeadDrawerOnboardingAnswersProps {
  detail: LeadDetail;
}

const SECTION_KEYS: { key: string; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "experience", label: "Experience" },
  { key: "qualifications", label: "Qualifications" },
  { key: "residency", label: "Residency" },
  { key: "preferences", label: "Preferences" },
  { key: "availability", label: "Availability" },
  { key: "salary", label: "Salary" },
  { key: "matching", label: "Matching" },
  { key: "about_you", label: "About" },
  { key: "lead_signals", label: "Lead signals" },
];

function summariseJsonb(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object") {
    try {
      const entries = Object.entries(value as Record<string, unknown>).slice(
        0,
        12,
      );
      return entries
        .map(
          ([k, v]) =>
            `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}`,
        )
        .join("\n");
    } catch {
      return JSON.stringify(value).slice(0, 200);
    }
  }
  return String(value);
}

export function LeadDrawerOnboardingAnswers({
  detail,
}: LeadDrawerOnboardingAnswersProps) {
  const [open, setOpen] = useState(false);

  if (!detail.nanny_lead) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Onboarding answers
        </h3>
        <p className="rounded border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
          No nanny_leads record found.
        </p>
      </section>
    );
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Onboarding answers
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {SECTION_KEYS.map(({ key, label }) => {
            const value = (
              detail.nanny_lead as Record<string, unknown> | null
            )?.[key];
            if (value === null || value === undefined) return null;
            return (
              <div
                key={key}
                className="rounded-md border border-slate-200 bg-white p-2"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-700">
                  {summariseJsonb(value)}
                </pre>
              </div>
            );
          })}
          {(detail.nanny_lead as Record<string, unknown>).ai_bio !== null &&
            typeof (detail.nanny_lead as Record<string, unknown>).ai_bio ===
              "string" && (
              <div className="rounded-md border border-slate-200 bg-white p-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  AI bio
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">
                  {
                    (detail.nanny_lead as Record<string, unknown>)
                      .ai_bio as string
                  }
                </p>
              </div>
            )}
        </div>
      )}
    </section>
  );
}
