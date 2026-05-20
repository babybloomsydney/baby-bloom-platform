"use client";

// T-032 — Drawer sticky header: name + status pill + action shortcuts.

import { useTransition } from "react";
import { Phone, MessageSquare, Mail, Send } from "lucide-react";
import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { Button } from "@/components/ui/button";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import type { LeadStatus, NannyContactState } from "@/lib/leads/types";
import { LEAD_STATUSES } from "@/lib/leads/types";
import { LeadStatusPill } from "./LeadStatusPill";
import { logContact, updateLeadStatus } from "./actions";

interface LeadDrawerHeaderProps {
  detail: LeadDetail;
  onLocalPatch: (next: LeadDetail) => void;
}

function fullName(detail: LeadDetail): string {
  const profile = detail.user_profile;
  if (!profile) return detail.nanny_user_id.slice(0, 8);
  const full = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return full || profile.email || detail.nanny_user_id.slice(0, 8);
}

function normaliseE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.replace(/^0+/, "");
}

export function LeadDrawerHeader({
  detail,
  onLocalPatch,
}: LeadDrawerHeaderProps) {
  const [isPending, startTransition] = useTransition();
  const profile = detail.user_profile;
  const status: LeadStatus = detail.contact_state?.lead_status ?? "untouched";
  const mobile = profile?.mobile_number ?? null;
  const email = profile?.email ?? null;
  const e164 = normaliseE164(mobile);

  const launchAndLog = (method: "call" | "sms" | "whatsapp" | "email") => {
    startTransition(async () => {
      const result = await logContact({
        nanny_user_id: detail.nanny_user_id,
        method,
        direction: "outbound",
        outcome: "pending",
      });
      if (result.success) {
        // Optimistic patch: bump local total_contacts via a fake log row.
        const next: LeadDetail = {
          ...detail,
          contact_state: detail.contact_state
            ? {
                ...detail.contact_state,
                last_contact_at: new Date().toISOString(),
              }
            : null,
        };
        onLocalPatch(next);
      }
    });
  };

  const onStatusChange = (s: LeadStatus) => {
    startTransition(async () => {
      const result = await updateLeadStatus({
        nanny_user_id: detail.nanny_user_id,
        status: s,
      });
      if (result.success) {
        const nextState: NannyContactState | null = detail.contact_state
          ? { ...detail.contact_state, lead_status: s }
          : {
              id: "",
              nanny_user_id: detail.nanny_user_id,
              lead_status: s,
              last_contact_at: null,
              total_contacts_manual_offset: 0,
              responded_ever_override: null,
              next_action_at: null,
              pinned_note: null,
              assigned_operator: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
        onLocalPatch({ ...detail, contact_state: nextState });
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <UserAvatar
          name={fullName(detail)}
          imageUrl={profile?.profile_picture_url ?? undefined}
          className="h-12 w-12 flex-shrink-0"
        />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-900">
            {fullName(detail)}
          </h2>
          <p className="truncate text-xs text-slate-500">{email ?? "—"}</p>
          <div className="mt-1 flex items-center gap-2">
            <LeadStatusPill status={status} />
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as LeadStatus)}
              disabled={isPending}
              className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="Change lead status"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!mobile || isPending}
          onClick={() => mobile && launchAndLog("call")}
          title="Call"
        >
          <a href={mobile ? `tel:${mobile}` : "#"} aria-label="Call">
            <Phone className="h-4 w-4" />
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!mobile || isPending}
          onClick={() => mobile && launchAndLog("sms")}
          title="SMS"
        >
          <a href={mobile ? `sms:${mobile}` : "#"} aria-label="Text">
            <MessageSquare className="h-4 w-4" />
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!e164 || isPending}
          onClick={() => e164 && launchAndLog("whatsapp")}
          title={e164 ? "WhatsApp" : "Mobile not in international format"}
        >
          <a
            href={e164 ? `https://wa.me/${e164}` : "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
          >
            <Send className="h-4 w-4" />
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={!email || isPending}
          onClick={() => email && launchAndLog("email")}
          title="Email"
        >
          <a href={email ? `mailto:${email}` : "#"} aria-label="Email">
            <Mail className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
