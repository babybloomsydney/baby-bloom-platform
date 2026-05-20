// T-032 — Status pill for the lead relationship pipeline.
// Colour scheme matches the existing admin StatusBadge palette.

import type { LeadStatus } from "@/lib/leads/types";

interface LeadStatusPillProps {
  status: LeadStatus;
  className?: string;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  untouched: "Untouched",
  in_conversation: "In conversation",
  responsive: "Responsive",
  unresponsive: "Unresponsive",
  dormant: "Dormant",
  do_not_contact: "Do not contact",
};

const STATUS_CLASSES: Record<LeadStatus, string> = {
  untouched: "bg-slate-100 text-slate-700 ring-slate-200",
  in_conversation: "bg-blue-100 text-blue-700 ring-blue-200",
  responsive: "bg-teal-100 text-teal-700 ring-teal-200",
  unresponsive: "bg-amber-100 text-amber-700 ring-amber-200",
  dormant: "bg-zinc-200 text-zinc-700 ring-zinc-300",
  do_not_contact: "bg-red-100 text-red-700 ring-red-200",
};

export function LeadStatusPill({
  status,
  className = "",
}: LeadStatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_CLASSES[status]} ${className}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
