"use client";

import { Eye, Sparkles } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import { DomainBadge } from "../shared/DomainBadge";
import { MasteryLabel } from "../shared/MasteryLabel";
import type { FeedItem, ObservationData } from "@/types/bapp";

interface ObservationTileProps {
  item: FeedItem;
}

export function ObservationTile({ item }: ObservationTileProps) {
  const data = item.data as unknown as ObservationData;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={Eye}
        iconColor="bg-purple-100 text-purple-600"
        badgeText="Observation"
        authorName={item.author_name}
        createdAt={item.created_at}
      />

      <div className="mt-3 space-y-2">
        {/* Image */}
        {data.image_url && (
          <TileImage src={data.image_url} alt="Observation" />
        )}

        {/* Domain badges */}
        {data.domain && (
          <div className="flex flex-wrap gap-1">
            <DomainBadge domain={data.domain} />
          </div>
        )}

        {/* Note text */}
        {data.note && (
          <p className="text-sm text-slate-600">{data.note}</p>
        )}

        {/* Score badge for focused with milestone */}
        {data.score != null && data.score > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Achieved:</span>
            <MasteryLabel score={data.score} />
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
