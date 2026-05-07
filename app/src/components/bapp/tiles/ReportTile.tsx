"use client";

import { CheckSquare } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import { InsightAccordion } from "./InsightAccordion";
import { DomainBadge } from "../shared/DomainBadge";
import { MasteryLabel } from "../shared/MasteryLabel";
import type {
  FeedItem,
  ReportData,
  ProgressData,
  ActivityData,
} from "@/types/bapp";
import type { Milestone } from "@/types/bapp";

interface ReportTileProps {
  item: FeedItem;
  /** All feed items — used to find sibling progress log */
  allItems: FeedItem[];
  milestoneMap?: Map<string, Milestone>;
}

export function ReportTile({ item, allItems, milestoneMap }: ReportTileProps) {
  const data = item.data as unknown as ReportData;

  // Parent activity title (via self-join parent_data)
  const parentData = item.parent_data as unknown as ActivityData | undefined;
  const activityTitle = parentData?.activity_json?.creativeName ?? "Activity";

  // Find sibling progress log: same parent_log_id as this report's id, type='progress'
  const siblingProgress = allItems.find(
    (i) => i.parent_log_id === item.id && i.type === "progress",
  );
  const progressData = siblingProgress
    ? (siblingProgress.data as unknown as ProgressData)
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={CheckSquare}
        iconColor="bg-blue-100 text-blue-600"
        badgeText="Activity Completed"
        authorName={item.author_name}
        createdAt={item.created_at}
        logId={item.id}
      />

      <div className="mt-3 space-y-2">
        {/* Image */}
        {data.image_url && <TileImage src={data.image_url} alt="Report" />}

        {/* Parent activity title */}
        <p className="text-sm font-medium text-slate-700">{activityTitle}</p>

        {/* Feedback */}
        {data.feedback && (
          <p className="text-sm text-slate-500">{data.feedback}</p>
        )}

        {/* Embedded progress section */}
        {progressData &&
          progressData.updates &&
          progressData.updates.length > 0 && (
            <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
              <p className="mb-1.5 text-xs font-medium text-emerald-700">
                Progress Update
              </p>
              <div className="space-y-1">
                {progressData.updates.map((update) => {
                  const milestone = milestoneMap?.get(update.id);
                  return (
                    <div key={update.id} className="flex items-center gap-2">
                      {milestone?.domain && (
                        <DomainBadge domain={milestone.domain} />
                      )}
                      <span className="flex-1 truncate text-xs text-slate-600">
                        {milestone?.description ?? update.id}
                      </span>
                      <MasteryLabel score={update.score} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* AI insight — expandable accordion. */}
        {data.insight && <InsightAccordion insight={data.insight} />}
      </div>
    </div>
  );
}
