"use client";

import { TrendingUp } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import { InsightAccordion } from "./InsightAccordion";
import { DomainBadge } from "../shared/DomainBadge";
import { MasteryLabel } from "../shared/MasteryLabel";
import type { FeedItem, ProgressData } from "@/types/bapp";
import type { Milestone } from "@/types/bapp";

interface ProgressTileProps {
  item: FeedItem;
  /** Milestone lookup for descriptions */
  milestoneMap?: Map<string, Milestone>;
}

export function ProgressTile({ item, milestoneMap }: ProgressTileProps) {
  const data = item.data as unknown as ProgressData;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={TrendingUp}
        iconColor="bg-emerald-100 text-emerald-600"
        badgeText="Growth"
        authorName={item.author_name}
        createdAt={item.created_at}
        logId={item.id}
      />

      <div className="mt-3 space-y-2">
        {/* Optional note */}
        {data.note && (
          <p className="text-sm italic text-slate-500">{data.note}</p>
        )}

        {/* Image */}
        {data.image_url && <TileImage src={data.image_url} alt="Progress" />}

        {/* Update list */}
        {data.updates && data.updates.length > 0 && (
          <div className="space-y-1.5">
            {data.updates.map((update) => {
              const milestone = milestoneMap?.get(update.id);
              const domain = milestone?.domain;
              // Defensive fallback: NEVER render raw milestone ids
              // (e.g. `CL_12_18_1`) to the user — regardless of whether
              // the caller forgot to pass milestoneMap (e.g. DraftTile
              // rendering a Progress preview without the map). Show a
              // user-safe placeholder instead. The full breakdown lives
              // on the Progress tab where the map is always available.
              const description = milestone?.description ?? "Milestone update";
              return (
                <div
                  key={update.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                >
                  {domain && <DomainBadge domain={domain} />}
                  <span className="flex-1 truncate text-xs text-slate-600">
                    {description}
                  </span>
                  <MasteryLabel score={update.score} />
                </div>
              );
            })}
          </div>
        )}

        {/* AI insight — expandable accordion. */}
        {data.insight && <InsightAccordion insight={data.insight} />}
      </div>
    </div>
  );
}
