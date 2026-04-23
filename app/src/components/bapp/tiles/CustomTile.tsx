"use client";

/**
 * CustomTile — renders bapp_logs rows of type='custom' (created by Katie
 * via `create_tile`). Matches the Sparkle accent used elsewhere in Katie
 * surfaces so the tile reads as Katie-authored at a glance.
 */

import { Sparkles } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import type { FeedItem } from "@/types/bapp";

interface CustomTileProps {
  item: FeedItem;
}

interface CustomTileData {
  title?: string;
  body?: string;
  image_url?: string;
  badge?: string;
}

export function CustomTile({ item }: CustomTileProps) {
  const data = item.data as unknown as CustomTileData;
  const badge = data.badge ?? "Katie";

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-3 shadow-sm">
      <TileHeader
        icon={Sparkles}
        iconColor="bg-violet-100 text-violet-600"
        badgeText={badge}
        authorName={item.author_name}
        createdAt={item.created_at}
      />
      <div className="mt-3 space-y-2">
        {data.image_url && (
          <TileImage src={data.image_url} alt={data.title ?? "Custom tile"} />
        )}
        {data.title && (
          <p className="text-sm font-semibold text-slate-900">{data.title}</p>
        )}
        {data.body && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {data.body}
          </p>
        )}
      </div>
    </div>
  );
}
