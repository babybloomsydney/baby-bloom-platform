// T-032 — Status pill for the lead relationship pipeline.
// Colour scheme matches the existing admin StatusBadge palette.
// T-032b expanded the set to 12 values; colours grouped by phase:
//   default       → slate
//   action verbs  → blue family (operator did something, awaiting outcome)
//   no_response   → amber (warning)
//   replied / in_conversation → teal (active dialogue)
//   booked        → indigo (scheduled commitment)
//   activated     → green (closed-won)
//   dormant       → zinc (parked)
//   do_not_contact→ red (hard stop)

import type { LeadStatus } from "@/lib/leads/types";

interface LeadStatusPillProps {
  status: LeadStatus;
  className?: string;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  untouched: "Untouched",
  called: "Called",
  texted: "Texted",
  emailed: "Emailed",
  voicemail_left: "Voicemail",
  no_response: "No response",
  replied: "Replied",
  in_conversation: "In conversation",
  booked: "Booked",
  activated: "Activated",
  dormant: "Dormant",
  do_not_contact: "Do not contact",
};

const STATUS_CLASSES: Record<LeadStatus, string> = {
  untouched: "bg-slate-100 text-slate-700 ring-slate-200",
  called: "bg-blue-50 text-blue-700 ring-blue-200",
  texted: "bg-blue-50 text-blue-700 ring-blue-200",
  emailed: "bg-blue-50 text-blue-700 ring-blue-200",
  voicemail_left: "bg-sky-50 text-sky-700 ring-sky-200",
  no_response: "bg-amber-100 text-amber-700 ring-amber-200",
  replied: "bg-teal-100 text-teal-700 ring-teal-200",
  in_conversation: "bg-teal-100 text-teal-700 ring-teal-200",
  booked: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  activated: "bg-green-100 text-green-700 ring-green-200",
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
