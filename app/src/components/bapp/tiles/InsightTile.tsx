"use client";

import { Lightbulb } from "lucide-react";
import type { FeedItem, InsightData } from "@/types/bapp";

interface InsightTileProps {
  item: FeedItem;
}

export function InsightTile({ item }: InsightTileProps) {
  const data = item.data as unknown as InsightData;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Lightbulb className="h-4 w-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <span className="inline-flex items-center rounded-full bg-amber-200/60 px-2 py-0.5 text-xs font-medium text-amber-700">
            AI Insight
          </span>
          <p className="mt-2 text-sm italic text-amber-800">{data.text}</p>
        </div>
      </div>
    </div>
  );
}
