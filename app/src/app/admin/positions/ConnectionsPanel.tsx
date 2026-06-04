"use client";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { CONNECTION_STAGE_LABELS } from "@/lib/position/constants";
import type { ConnectionStage } from "@/lib/position/constants";
import type { PositionConnection } from "./page";
import { NannyNameLink } from "./NannyNameLink";
import {
  splitConnectionsByOrigin,
  stageTimestamp,
  formatSydneyTime,
  getConnectionStageBadgeVariant,
  HELD_CONNECTION_STAGES,
  type PerStageCounts,
} from "./positions.helpers";

const PIPELINE_STAGES: { key: keyof PerStageCounts; label: string }[] = [
  { key: "matched", label: "matched" },
  { key: "invited", label: "invited" },
  { key: "applied", label: "applied" },
  { key: "accepted", label: "accepted" },
  { key: "meet", label: "meet" },
  { key: "trial", label: "trial" },
  { key: "offered", label: "offered" },
  { key: "placed", label: "placed" },
];

function stageLabel(stage: number | null): string {
  if (stage == null) return "Unknown";
  // The `as ConnectionStage` index is guarded by the `??` fallback for any code not in the labels map.
  return CONNECTION_STAGE_LABELS[stage as ConnectionStage] ?? `Stage ${stage}`;
}

function PipelineCounts({ counts }: { counts: PerStageCounts }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PIPELINE_STAGES.map(({ key, label }) => (
        <span
          key={key}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            counts[key] > 0
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span className="font-semibold">{counts[key]}</span> {label}
        </span>
      ))}
    </div>
  );
}

function ConnRows({
  connections,
  onOpenUser,
}: {
  connections: PositionConnection[];
  onOpenUser: (userId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left font-medium text-slate-600"
            >
              Nanny
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left font-medium text-slate-600"
            >
              Stage
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left font-medium text-slate-600"
            >
              Meet time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {connections.map((c) => {
            const ts = stageTimestamp(c);
            const held =
              c.connection_stage != null &&
              HELD_CONNECTION_STAGES.includes(c.connection_stage);
            return (
              <tr key={c.id} className="hover:bg-white">
                <td className="px-3 py-2">
                  <NannyNameLink
                    userId={c.nanny_user_id}
                    name={c.nanny_name}
                    onOpenUser={onOpenUser}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1">
                      <StatusBadge
                        variant={getConnectionStageBadgeVariant(
                          c.connection_stage,
                        )}
                      >
                        {stageLabel(c.connection_stage)}
                      </StatusBadge>
                      {held && (
                        <span className="text-[10px] font-medium text-amber-700">
                          pending OCG
                        </span>
                      )}
                    </span>
                    {ts && (
                      <span className="text-[11px] text-slate-500">
                        {formatSydneyTime(ts)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {c.confirmed_time ? formatSydneyTime(c.confirmed_time) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OriginSection({
  title,
  caveat,
  connections,
  onOpenUser,
}: {
  title: string;
  caveat?: string;
  connections: PositionConnection[];
  onOpenUser: (userId: string) => void;
}) {
  if (connections.length === 0) return null;
  return (
    <div>
      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
        {caveat && (
          <span className="font-normal normal-case text-slate-400">
            {" "}
            {caveat}
          </span>
        )}
      </h5>
      <ConnRows connections={connections} onOpenUser={onOpenUser} />
    </div>
  );
}

export function ConnectionsPanel({
  connections,
  perStageCounts,
  onOpenUser,
}: {
  connections: PositionConnection[];
  perStageCounts: PerStageCounts;
  onOpenUser: (userId: string) => void;
}) {
  const { parentInitiated, nannyApplied, dfy } =
    splitConnectionsByOrigin(connections);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Pipeline</h4>
        <PipelineCounts counts={perStageCounts} />
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-slate-400">No connections yet.</p>
      ) : (
        <div className="space-y-3">
          <OriginSection
            title="Parent-initiated"
            caveat="(best-effort)"
            connections={parentInitiated}
            onOpenUser={onOpenUser}
          />
          <OriginSection
            title="Nanny-applied"
            connections={nannyApplied}
            onOpenUser={onOpenUser}
          />
          <OriginSection
            title="DFY"
            connections={dfy}
            onOpenUser={onOpenUser}
          />
        </div>
      )}
    </div>
  );
}
