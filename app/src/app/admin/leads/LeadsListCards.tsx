"use client";

// T-032 — Mobile card list (replaces table below md breakpoint).

import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Users } from "lucide-react";
import type { LeadRow } from "@/lib/leads/types";
import { LeadStatusPill } from "./LeadStatusPill";
import { VerificationMiniChip } from "./VerificationMiniChip";

interface LeadsListCardsProps {
  rows: LeadRow[];
  onRowClick: (nannyUserId: string) => void;
  isPending?: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return new Date(iso).toLocaleDateString();
  const day = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (day === 0) return "today";
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.floor(day / 365)}y ago`;
}

function fullName(row: LeadRow): string {
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return full || (row.email ?? row.nanny_user_id.slice(0, 8));
}

export function LeadsListCards({
  rows,
  onRowClick,
  isPending,
}: LeadsListCardsProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <EmptyState
          icon={Users}
          title="No nannies match these filters"
          description="Try clearing filters or switching to the All tab."
        />
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${isPending ? "opacity-50" : ""}`}>
      {rows.map((row) => {
        const status = row.contact_state?.lead_status ?? "untouched";
        return (
          <button
            key={row.nanny_user_id}
            type="button"
            onClick={() => onRowClick(row.nanny_user_id)}
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <UserAvatar
                name={fullName(row)}
                imageUrl={row.profile_picture_url ?? undefined}
                className="h-10 w-10"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">
                      {fullName(row)}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {row.email ?? "—"} · {row.suburb ?? "—"}
                    </div>
                  </div>
                  <LeadStatusPill status={status} className="flex-shrink-0" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>Signed up {relTime(row.signup_at)}</span>
                  <VerificationMiniChip verification={row.verification} />
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      row.bonus_program_completed_at
                        ? "bg-green-50 text-green-700 ring-green-200"
                        : "bg-slate-50 text-slate-500 ring-slate-200"
                    }`}
                  >
                    {row.bonus_program_completed_at
                      ? "Contributions ✓"
                      : "Contributions ✗"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span>
                    {row.children_linked_count}{" "}
                    {row.children_linked_count === 1 ? "child" : "children"}
                  </span>
                  <span>· {row.total_contacts_derived} contacts</span>
                  <span>
                    · last{" "}
                    {row.contact_state?.last_contact_at
                      ? relTime(row.contact_state.last_contact_at)
                      : "never"}
                  </span>
                  {row.responded_ever_derived && (
                    <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                      Responded
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
