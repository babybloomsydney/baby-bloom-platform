"use client";

import { Eye } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import { InsightAccordion } from "./InsightAccordion";
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
        logId={item.id}
      />

      <div className="mt-3 space-y-2">
        {/* Image */}
        {data.image_url && <TileImage src={data.image_url} alt="Observation" />}

        {/* Domain badges — suppressed for "General" observations
            per user spec (2026-05-07): a generic note doesn't need
            to broadcast its catch-all domain. Focused observations
            with a real domain still render the pill. */}
        {data.domain && data.domain !== "General" && (
          <div className="flex flex-wrap gap-1">
            <DomainBadge domain={data.domain} />
          </div>
        )}

        {/* Note text */}
        {data.note && <p className="text-sm text-slate-600">{data.note}</p>}

        {/* Score badge for focused with milestone */}
        {data.score != null && data.score > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Achieved:</span>
            <MasteryLabel score={data.score} />
          </div>
        )}

        {/* AI insight — expandable accordion (collapsed shows the
            first paragraph, expand to see all). */}
        {data.insight && <InsightAccordion insight={data.insight} />}
      </div>
    </div>
  );
}
