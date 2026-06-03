"use client";

// T-032 — Availability section: shows the nanny's authoritative weekly
// schedule from `nanny_availability` table and lets admins edit it on the
// nanny's behalf (e.g. mid-phone-call). Display state uses the existing
// AvailabilityGrid; edit state swaps in EditableAvailabilityGrid + save
// button. Saving fires `updateNannyAvailability` which writes the row,
// logs the change to `activity_logs`, and emails the nanny.

import { useState, useTransition } from "react";
import { CalendarClock, Pencil, X, Save, Loader2 } from "lucide-react";
import { AvailabilityGrid } from "@/components/profile/AvailabilityGrid";
import {
  EditableAvailabilityGrid,
  type AvailabilityFormValue,
} from "@/components/profile/EditableAvailabilityGrid";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import { updateNannyAvailability } from "./actions";

interface LeadDrawerAvailabilityProps {
  detail: LeadDetail;
  onLocalPatch: (next: LeadDetail) => void;
}

function firstName(detail: LeadDetail): string {
  return detail.user_profile?.first_name ?? "nanny";
}

function deriveInitialForm(detail: LeadDetail): AvailabilityFormValue {
  const av = detail.availability;
  const rawSchedule = (av?.schedule ?? {}) as Record<string, unknown>;
  const schedule: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(rawSchedule)) {
    schedule[k] = Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  }
  return {
    available_days: av?.days_available ?? [],
    schedule,
  };
}

export function LeadDrawerAvailability({
  detail,
  onLocalPatch,
}: LeadDrawerAvailabilityProps) {
  const av = detail.availability;
  const days = av?.days_available ?? [];
  const schedule = (av?.schedule ?? {}) as Record<string, unknown>;
  const hasSchedule = Object.keys(schedule).length > 0;
  const hasDays = days.length > 0;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AvailabilityFormValue>(() =>
    deriveInitialForm(detail),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const openEditor = () => {
    setForm(deriveInitialForm(detail));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateNannyAvailability({
        nanny_user_id: detail.nanny_user_id,
        available_days: form.available_days,
        schedule: form.schedule,
      });
      if (!result.success) {
        setError(result.error ?? "Save failed.");
        return;
      }
      // Optimistic local patch so the display reflects the new schedule
      // without waiting for the parent's revalidation pass.
      onLocalPatch({
        ...detail,
        availability: {
          days_available: form.available_days,
          schedule: form.schedule,
        },
      });
      setEditing(false);
    });
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <CalendarClock className="h-3 w-3" />
          Availability
        </h3>
        {!editing ? (
          <button
            type="button"
            onClick={openEditor}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Save &amp; notify nanny
            </button>
          </div>
        )}
      </div>

      {!editing && !hasSchedule && !hasDays && (
        <p className="rounded border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
          No availability set yet — click Edit to add one.
        </p>
      )}

      {!editing && hasDays && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            Days:
          </span>
          {days.map((d) => (
            <span
              key={d}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200"
            >
              {d}
            </span>
          ))}
        </div>
      )}

      {!editing && hasSchedule && (
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <AvailabilityGrid schedule={schedule} firstName={firstName(detail)} />
        </div>
      )}

      {editing && (
        <div className="rounded-md border border-violet-200 bg-violet-50/30 p-2">
          <p className="mb-2 text-[11px] text-slate-500">
            Click cells to toggle availability. Saving updates the nanny&apos;s
            profile everywhere and emails them a confirmation.
          </p>
          <EditableAvailabilityGrid
            value={form}
            onChange={setForm}
            disabled={pending}
          />
          {error && (
            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
