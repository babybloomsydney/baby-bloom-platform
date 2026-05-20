"use client";

// T-032 — Drawer shell. Composes all 14 sections of the nanny-360 view.

import { useEffect, useState } from "react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import type { TimelineEvent } from "@/lib/leads/types";
import { LeadDrawerHeader } from "./LeadDrawerHeader";
import { LeadDrawerStats } from "./LeadDrawerStats";
import { LeadDrawerPreCallContext } from "./LeadDrawerPreCallContext";
import { LeadDrawerContactPanel } from "./LeadDrawerContactPanel";
import { LeadDrawerLogContactForm } from "./LeadDrawerLogContactForm";
import { LeadDrawerPinnedNote } from "./LeadDrawerPinnedNote";
import { LeadDrawerContactLog } from "./LeadDrawerContactLog";
import { LeadDrawerNotes } from "./LeadDrawerNotes";
import { LeadDrawerActivityTimeline } from "./LeadDrawerActivityTimeline";
import { LeadDrawerVerificationBreakdown } from "./LeadDrawerVerificationBreakdown";
import { LeadDrawerChildrenPositions } from "./LeadDrawerChildrenPositions";
import { LeadDrawerOnboardingAnswers } from "./LeadDrawerOnboardingAnswers";
import { LeadDrawerSubscriptionPayout } from "./LeadDrawerSubscriptionPayout";
import { LeadDrawerFooterMeta } from "./LeadDrawerFooterMeta";

interface LeadDrawerProps {
  detail: LeadDetail;
  timeline: TimelineEvent[];
}

export function LeadDrawer({ detail, timeline }: LeadDrawerProps) {
  // Optimistic local copy of the detail so child sections can patch fields
  // immediately after a server action before the RSC re-fetch lands.
  const [local, setLocal] = useState<LeadDetail>(detail);

  // Re-sync when a new detail arrives via parent (server-driven navigation).
  useEffect(() => setLocal(detail), [detail]);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <LeadDrawerHeader detail={local} onLocalPatch={setLocal} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <div className="space-y-5 py-4">
          <LeadDrawerStats detail={local} onLocalPatch={setLocal} />
          <LeadDrawerPreCallContext detail={local} />
          <LeadDrawerContactPanel detail={local} />
          <LeadDrawerLogContactForm detail={local} onLocalPatch={setLocal} />
          <LeadDrawerPinnedNote detail={local} onLocalPatch={setLocal} />
          <LeadDrawerContactLog detail={local} onLocalPatch={setLocal} />
          <LeadDrawerNotes detail={local} onLocalPatch={setLocal} />
          <LeadDrawerActivityTimeline events={timeline} />
          <LeadDrawerVerificationBreakdown detail={local} />
          <LeadDrawerChildrenPositions detail={local} />
          <LeadDrawerOnboardingAnswers detail={local} />
          <LeadDrawerSubscriptionPayout detail={local} />
          <LeadDrawerFooterMeta detail={local} />
        </div>
      </div>
    </div>
  );
}
