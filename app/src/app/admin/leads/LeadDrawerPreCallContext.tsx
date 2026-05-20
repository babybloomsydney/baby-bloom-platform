// T-032 — One-line stitched pre-call context strip (no AI, just templated).

import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";

interface LeadDrawerPreCallContextProps {
  detail: LeadDetail;
}

function relDays(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days < 0) return `in ${-days}d`;
  if (days === 0) return "today";
  return `${days}d ago`;
}

function composeContext(detail: LeadDetail): string {
  const parts: string[] = [];

  const signupAge = relDays(detail.nanny?.created_at);
  if (signupAge) parts.push(`Signed up ${signupAge}`);

  const v = detail.verifications;
  const verBadges: string[] = [];
  if (v?.identity_verified === true) verBadges.push("ID");
  if (v?.wwcc_verified === true) verBadges.push("WWCC");
  if (detail.user_profile?.profile_picture_url) verBadges.push("photo");
  if (detail.nanny?.abn) verBadges.push("ABN");
  if (verBadges.length > 0) parts.push(`${verBadges.join(" + ")} done`);
  else parts.push("no verification yet");

  const childrenCount = detail.children_linked.filter(
    (c) => c.status === "connected",
  ).length;
  parts.push(
    `${childrenCount} ${childrenCount === 1 ? "child" : "children"} linked`,
  );

  const positionsCount = detail.interview_requests.length;
  if (positionsCount > 0) {
    parts.push(
      `${positionsCount} ${positionsCount === 1 ? "position" : "positions"} applied`,
    );
  }

  if (detail.nanny?.bonus_program_completed_at) {
    parts.push("contributions complete");
  } else {
    parts.push("contributions incomplete");
  }

  return parts.join(" · ");
}

export function LeadDrawerPreCallContext({
  detail,
}: LeadDrawerPreCallContextProps) {
  return (
    <div className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 ring-1 ring-inset ring-violet-200">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
        Pre-call{" "}
      </span>
      <span className="ml-1">{composeContext(detail)}</span>
    </div>
  );
}
