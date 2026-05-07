"use client";

/**
 * CustomTile — renders bapp_logs rows of type='custom' (created by Katie
 * via `create_tile`). Matches the Sparkle accent used elsewhere in Katie
 * surfaces so the tile reads as Katie-authored at a glance.
 */

import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import { SparkleIcon } from "@/components/katie/messages/SparkleIcon";
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
  // Header label: prefer the AI-supplied title, then any explicit
  // badge, then a generic "Note". Per user feedback (2026-05-07) the
  // header must NEVER read "Katie" — Katie's authorship is conveyed
  // by the leading SparkleIcon, so spelling her name in text would
  // be redundant. The standalone title `<p>` below the header is
  // dropped (it duplicated the new header label).
  const headerLabel = data.title ?? data.badge ?? "Note";

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-3 shadow-sm">
      <TileHeader
        icon={SparkleIcon}
        iconColor="bg-violet-100 text-violet-600"
        badgeText={headerLabel}
        authorName={item.author_name}
        createdAt={item.created_at}
        // Custom tiles are Katie-authored. The leading SparkleIcon
        // already conveys that — adding the calling user's name as
        // text next to the badge would be misleading.
        hideAuthor
        logId={item.id}
      />
      <div className="mt-3 space-y-2">
        {data.image_url && (
          <TileImage src={data.image_url} alt={data.title ?? "Custom tile"} />
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
