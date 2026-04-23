"use client";

import { TrendingUp, Sparkles } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
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
      />

      <div className="mt-3 space-y-2">
        {/* Optional note */}
        {data.note && (
          <p className="text-sm italic text-slate-500">{data.note}</p>
        )}

        {/* Image */}
        {data.image_url && (
          <TileImage src={data.image_url} alt="Progress" />
        )}

        {/* Update list */}
        {data.updates && data.updates.length > 0 && (
          <div className="space-y-1.5">
            {data.updates.map((update) => {
              const milestone = milestoneMap?.get(update.id);
              const domain = milestone?.domain;
              return (
                <div
                  key={update.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5"
                >
                  {domain && <DomainBadge domain={domain} />}
                  <span className="flex-1 truncate text-xs text-slate-600">
                    {milestone?.description ?? update.id}
                  </span>
                  <MasteryLabel score={update.score} />
                </div>
              );
            })}
          </div>
        )}

        {/* AI insight */}
        {data.insight && (
          <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            <div className="space-y-1.5">
              {data.insight.split("\n\n").map((p, i) => (
                <p key={i} className="text-xs italic text-amber-700">{p}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
