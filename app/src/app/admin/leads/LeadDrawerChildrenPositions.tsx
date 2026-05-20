// T-032 — Children + positions + placements + babysitting summary in the drawer.

import { Heart, Briefcase, Baby } from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";

interface LeadDrawerChildrenPositionsProps {
  detail: LeadDetail;
}

function fmt(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export function LeadDrawerChildrenPositions({
  detail,
}: LeadDrawerChildrenPositionsProps) {
  const connected = detail.children_linked.filter(
    (c) => c.status === "connected",
  );
  const pending = detail.children_linked.filter((c) => c.status === "pending");
  const activePlacements = detail.placements.filter(
    (p) => p.status === "active",
  );

  return (
    <section className="space-y-3">
      {/* Children */}
      <div>
        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Heart className="h-3 w-3" />
          Children linked
          <span className="font-normal text-slate-400">
            ({connected.length} connected
            {pending.length > 0 ? ` · ${pending.length} pending` : ""})
          </span>
        </h3>
        {connected.length === 0 && pending.length === 0 ? (
          <p className="rounded border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400">
            No children linked.{" "}
            {!detail.nanny?.bonus_program_completed_at && (
              <span className="text-violet-700">
                Bonus contributions not set up yet — upsell opportunity.
              </span>
            )}
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.children_linked.slice(0, 8).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <span className="text-slate-700">
                  Child {c.child_client_id.slice(0, 8)}
                  {c.bonus_program && (
                    <span className="ml-1 rounded bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-700">
                      bonus
                    </span>
                  )}
                </span>
                <span className="text-slate-500">
                  {c.status} · {fmt(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Positions / interviews */}
      <div>
        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Briefcase className="h-3 w-3" />
          Positions applied
          <span className="font-normal text-slate-400">
            ({detail.interview_requests.length})
          </span>
        </h3>
        {detail.interview_requests.length === 0 ? (
          <p className="rounded border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400">
            No position applications.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.interview_requests.slice(0, 6).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <span className="text-slate-700">
                  Position {r.position_id?.slice(0, 8) ?? "—"}
                </span>
                <span className="text-slate-500">
                  {r.status}
                  {r.outcome ? ` · ${r.outcome}` : ""} · {fmt(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Placements */}
      <div>
        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Briefcase className="h-3 w-3" />
          Placements
          <span className="font-normal text-slate-400">
            ({activePlacements.length} active / {detail.placements.length}{" "}
            total)
          </span>
        </h3>
        {detail.placements.length === 0 ? (
          <p className="rounded border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400">
            No placements yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.placements.slice(0, 4).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <span className="text-slate-700">
                  Hired {fmt(p.hired_at)}
                  {p.source && (
                    <span className="ml-1 text-slate-400">via {p.source}</span>
                  )}
                </span>
                <span className="text-slate-500">
                  {p.status}
                  {p.end_reason ? ` · ${p.end_reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Babysitting */}
      {detail.babysitting_notifications.length > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Baby className="h-3 w-3" />
            Babysitting offers
            <span className="font-normal text-slate-400">
              ({detail.babysitting_notifications.length})
            </span>
          </h3>
          <p className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
            {
              detail.babysitting_notifications.filter((b) => b.accepted_at)
                .length
            }{" "}
            accepted ·{" "}
            {
              detail.babysitting_notifications.filter((b) => b.declined_at)
                .length
            }{" "}
            declined · last notified{" "}
            {fmt(detail.babysitting_notifications[0]?.notified_at)}
          </p>
        </div>
      )}
    </section>
  );
}
