"use client";

import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { ActivePlacement } from "./positions.helpers";
import { formatSydneyTime } from "./positions.helpers";
import { NannyNameLink } from "./NannyNameLink";

export function PlacementPanel({
  placement,
  onOpenUser,
}: {
  placement: ActivePlacement | null;
  onOpenUser: (userId: string) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-700">Placement</h4>
      {placement ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <StatusBadge variant="active">Active</StatusBadge>
          <NannyNameLink
            userId={placement.nanny_user_id}
            name={placement.nanny_name}
            onOpenUser={onOpenUser}
          />
          {placement.weekly_hours != null && (
            <span>
              <strong>{placement.weekly_hours}</strong>h/wk
            </span>
          )}
          {placement.hourly_rate != null && (
            <span>${placement.hourly_rate}/hr</span>
          )}
          {placement.hired_at && (
            <span>since {formatSydneyTime(placement.hired_at)}</span>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No active placement.</p>
      )}
    </div>
  );
}
