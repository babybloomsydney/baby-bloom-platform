"use client";

import { Wand2, Loader2 } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { DomainBadge } from "../shared/DomainBadge";
import type { FeedItem, ActivityData } from "@/types/bapp";

interface ActivityTileProps {
  item: FeedItem;
  onViewActivity?: (item: FeedItem) => void;
}

export function ActivityTile({ item, onViewActivity }: ActivityTileProps) {
  const data = item.data as unknown as ActivityData;

  // Pending state
  if (item.status === "pending") {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-500">
              Generating...
            </span>
            <p className="text-xs text-slate-400">
              Creating your activity plan
            </p>
          </div>
        </div>
      </div>
    );
  }

  const plan = data.activity_json;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={Wand2}
        iconColor="bg-indigo-100 text-indigo-600"
        badgeText="Activity"
        authorName={item.author_name}
        createdAt={item.created_at}
      />

      {plan && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-slate-800">
            {plan.creativeName}
          </p>
          <p className="text-xs text-indigo-500">
            {plan.recommendedLine}
          </p>

          {/* Selected objectives */}
          {data.prompt_context && data.prompt_context.length > 0 && (
            <div className="space-y-1">
              {data.prompt_context.map((obj, i) => (
                <div key={i} className="flex items-center gap-2">
                  <DomainBadge domain={obj.domain} />
                  <span className="flex-1 truncate text-xs text-slate-600">
                    {obj.desc}
                  </span>
                </div>
              ))}
            </div>
          )}

          {onViewActivity && (
            <button
              type="button"
              onClick={() => onViewActivity(item)}
              className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View Activity →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
