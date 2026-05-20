"use client";

// T-032 — Contact panel: phone / email / whatsapp / suburb / address with copy.

import { useState } from "react";
import {
  Copy,
  Check,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  Home,
} from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";

interface LeadDrawerContactPanelProps {
  detail: LeadDetail;
}

interface ContactRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}

function ContactRow({ icon: Icon, label, value }: ContactRowProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="truncate text-sm text-slate-900">
            {value ?? <span className="italic text-slate-400">—</span>}
          </div>
        </div>
      </div>
      {value && (
        <button
          type="button"
          onClick={copy}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export function LeadDrawerContactPanel({
  detail,
}: LeadDrawerContactPanelProps) {
  const p = detail.user_profile;
  const address = [p?.address_line1, p?.address_line2]
    .filter(Boolean)
    .join(" ");

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Contact
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ContactRow
          icon={Phone}
          label="Mobile"
          value={p?.mobile_number ?? null}
        />
        <ContactRow icon={Mail} label="Email" value={p?.email ?? null} />
        <ContactRow
          icon={MessageSquare}
          label="WhatsApp"
          value={p?.mobile_number ?? null}
        />
        <ContactRow
          icon={MapPin}
          label="Suburb"
          value={[p?.suburb, p?.postcode].filter(Boolean).join(" ") || null}
        />
        {address && (
          <div className="sm:col-span-2">
            <ContactRow icon={Home} label="Address" value={address} />
          </div>
        )}
      </div>
    </section>
  );
}
