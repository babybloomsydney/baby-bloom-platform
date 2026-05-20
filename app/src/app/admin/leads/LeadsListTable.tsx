"use client";

// T-032 — Desktop list table.

import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Users } from "lucide-react";
import type { LeadRow } from "@/lib/leads/types";
import { LeadStatusPill } from "./LeadStatusPill";
import { VerificationMiniChip } from "./VerificationMiniChip";

interface LeadsListTableProps {
  rows: LeadRow[];
  onRowClick: (nannyUserId: string) => void;
  openLeadId: string | null;
  isPending?: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (diffMs < 0) {
    const days = Math.ceil(-diffMs / (24 * 60 * 60 * 1000));
    return `in ${days}d`;
  }
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

function fullName(row: LeadRow): string {
  const f = row.first_name ?? "";
  const l = row.last_name ?? "";
  const full = `${f} ${l}`.trim();
  return full.length > 0 ? full : (row.email ?? row.nanny_user_id.slice(0, 8));
}

function levelLabel(level: number | null): string {
  if (level === null) return "—";
  const names = ["Signed up", "Registered", "ID verified", "Prov.", "Full"];
  return `Lv ${level}` + (names[level] ? ` ${names[level]}` : "");
}

export function LeadsListTable({
  rows,
  onRowClick,
  openLeadId,
  isPending,
}: LeadsListTableProps) {
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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Signed up</th>
            <th className="px-3 py-2 font-medium">Verification</th>
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 font-medium text-center">Children</th>
            <th className="px-3 py-2 font-medium">Contributions</th>
            <th className="px-3 py-2 font-medium">Last contact</th>
            <th className="px-3 py-2 font-medium text-center">Contacts</th>
            <th className="px-3 py-2 font-medium">Responded</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Next action</th>
            <th className="px-3 py-2 font-medium">Suburb</th>
          </tr>
        </thead>
        <tbody
          className={`divide-y divide-slate-100 ${isPending ? "opacity-50" : ""}`}
        >
          {rows.map((row) => {
            const isOpen = openLeadId === row.nanny_user_id;
            const status = row.contact_state?.lead_status ?? "untouched";
            return (
              <tr
                key={row.nanny_user_id}
                onClick={() => onRowClick(row.nanny_user_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row.nanny_user_id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open ${fullName(row)}`}
                aria-current={isOpen ? "true" : undefined}
                className={`cursor-pointer transition hover:bg-slate-50 focus:bg-violet-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset ${isOpen ? "bg-violet-50/40" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={fullName(row)}
                      imageUrl={row.profile_picture_url ?? undefined}
                      className="h-8 w-8"
                    />
                    <div>
                      <div className="font-medium text-slate-900">
                        {fullName(row)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.email ?? "—"}
                      </div>
                    </div>
                  </div>
                </td>
                <td
                  className="px-3 py-2 whitespace-nowrap text-xs text-slate-600"
                  title={row.signup_at}
                >
                  {relTime(row.signup_at)}
                </td>
                <td className="px-3 py-2">
                  <VerificationMiniChip verification={row.verification} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">
                  {levelLabel(row.verification.verification_level)}
                </td>
                <td className="px-3 py-2 text-center text-sm">
                  {row.children_linked_count}
                  {row.bonus_children_count > 0 && (
                    <span
                      className="ml-1 text-[10px] font-medium text-violet-600"
                      title="Linked via bonus program"
                    >
                      ★{row.bonus_children_count}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      row.bonus_program_completed_at
                        ? "bg-green-50 text-green-700 ring-green-200"
                        : "bg-slate-50 text-slate-500 ring-slate-200"
                    }`}
                  >
                    {row.bonus_program_completed_at ? "Complete" : "Incomplete"}
                  </span>
                </td>
                <td
                  className="px-3 py-2 whitespace-nowrap text-xs text-slate-600"
                  title={row.contact_state?.last_contact_at ?? "Never"}
                >
                  {row.contact_state?.last_contact_at ? (
                    relTime(row.contact_state.last_contact_at)
                  ) : (
                    <em className="text-slate-500">Never</em>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-sm">
                  {row.total_contacts_derived}
                </td>
                <td className="px-3 py-2">
                  {row.responded_ever_derived ? (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                      Yes
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      No
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <LeadStatusPill status={status} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                  {row.contact_state?.next_action_at
                    ? new Date(
                        row.contact_state.next_action_at,
                      ).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.suburb ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
