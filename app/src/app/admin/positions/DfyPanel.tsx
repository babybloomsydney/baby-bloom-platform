"use client";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { AdminPosition } from "./page";
import { NannyNameLink } from "./NannyNameLink";
import {
  deriveDfyState,
  dfyMatchStatusVariant,
  dfyMatchStatusLabel,
  formatSydneyTime,
  type DfyState,
  type BadgeVariant,
} from "./positions.helpers";

function tierLabel(tier: string): string {
  return tier === "priority" ? "Advanced" : "Standard";
}

function dfyStateBadge(state: DfyState): {
  variant: BadgeVariant;
  label: string;
  detail: string | null;
} {
  switch (state.kind) {
    case "none":
      return { variant: "inactive", label: "Not activated", detail: null };
    case "active":
      return {
        variant: "verified",
        label: `${tierLabel(state.tier)} — active`,
        detail: state.expiresAt
          ? `expires ${formatSydneyTime(state.expiresAt)}`
          : null,
      };
    case "expired":
      return {
        variant: "inactive",
        label: `${tierLabel(state.tier)} — expired`,
        detail: `expired ${formatSydneyTime(state.expiredAt)}`,
      };
    case "completed":
      return {
        variant: "active",
        label: `${tierLabel(state.tier)} — completed`,
        detail: "enough nannies responded",
      };
    case "ended_user":
      return {
        variant: "failed",
        label: "Ended",
        detail: "position closed / ended",
      };
    case "ended_system":
      return {
        variant: "active",
        label: "Filled",
        detail: state.filledAt
          ? `filled ${formatSydneyTime(state.filledAt)}`
          : null,
      };
    default: {
      const _exhaustive: never = state;
      return { variant: "inactive", label: "Unknown", detail: null };
    }
  }
}

export function DfyPanel({
  position,
  onOpenUser,
}: {
  position: AdminPosition;
  onOpenUser: (userId: string) => void;
}) {
  const state = deriveDfyState({
    dfy_activated_at: position.dfy_activated_at,
    dfy_expires_at: position.dfy_expires_at,
    position_status: position.position_status,
    filled_by_nanny_id: position.filled_by_nanny_id,
    filled_at: position.filled_at,
    dfy_tier: position.dfy_tier,
    dfyMatches: position.dfyMatches,
  });
  const badge = dfyStateBadge(state);
  const waveCount = position.dfy_wave_sent?.length ?? 0;
  const totalWaves = position.dfy_tier === "priority" ? 3 : 1;
  const matches = position.dfyMatches;

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">
        DFY matchmaking
      </h4>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <StatusBadge variant={badge.variant}>DFY · {badge.label}</StatusBadge>
        {badge.detail && <span className="text-slate-500">{badge.detail}</span>}
        {state.kind !== "none" && waveCount > 0 && (
          <span className="text-[11px] text-slate-500">
            · wave {waveCount} of {totalWaves} sent
          </span>
        )}
      </div>

      {matches.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
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
                  Status
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-slate-600"
                >
                  Wave
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-slate-600"
                >
                  Score
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-slate-600"
                >
                  Distance
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left font-medium text-slate-600"
                >
                  Contacted
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matches.map((m) => (
                <tr key={m.nanny_id} className="hover:bg-white">
                  <td className="px-3 py-2">
                    <NannyNameLink
                      userId={m.nanny_user_id}
                      name={m.nanny_name}
                      onOpenUser={onOpenUser}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge variant={dfyMatchStatusVariant(m.status)}>
                      {dfyMatchStatusLabel(m.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{m.wave ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {m.match_score != null ? m.match_score.toFixed(0) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {m.distance_km != null
                      ? `${m.distance_km.toFixed(1)} km`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {m.notified_at ? formatSydneyTime(m.notified_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-400">
          {state.kind === "none"
            ? "DFY has not been activated for this position."
            : "No DFY matches recorded."}
        </p>
      )}
    </div>
  );
}
