"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import { FEED_POLL_INTERVAL } from "@/lib/bapp-constants";
import { getFeed } from "@/lib/actions/bapp/feed";
import { ObservationTile } from "./tiles/ObservationTile";
import { ProgressTile } from "./tiles/ProgressTile";
import { DiaryTile } from "./tiles/DiaryTile";
import { ActivityTile } from "./tiles/ActivityTile";
import { ReportTile } from "./tiles/ReportTile";
import { InsightTile } from "./tiles/InsightTile";
import { CustomTile } from "./tiles/CustomTile";
import { ActivityDetailSheet } from "./sheets/ActivityDetailSheet";
import type { FeedItem, Milestone } from "@/types/bapp";

interface BAppFeedViewProps {
  childId: string;
  initialFeed: FeedItem[];
  milestones: Milestone[];
}

export function BAppFeedView({
  childId,
  initialFeed,
  milestones,
}: BAppFeedViewProps) {
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [detailItem, setDetailItem] = useState<FeedItem | null>(null);

  // Build milestone lookup map
  const milestoneMap = useMemo(() => {
    const map = new Map<string, Milestone>();
    for (const m of milestones) {
      map.set(m.id, m);
    }
    return map;
  }, [milestones]);

  // Check if any pending activities exist
  const hasPending = useMemo(
    () => feed.some((i) => i.type === "activity" && i.status === "pending"),
    [feed],
  );

  // Smart polling — only when pending items exist
  const refreshFeed = useCallback(async () => {
    const result = await getFeed(childId);
    if (result.success) {
      setFeed(result.data);
    }
  }, [childId]);

  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(refreshFeed, FEED_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [hasPending, refreshFeed]);

  // Also refresh when feed is updated externally (e.g. after observation)
  useEffect(() => {
    setFeed(initialFeed);
  }, [initialFeed]);

  // Show all adhoc items in the feed
  const visibleFeed = useMemo(
    () => feed.filter((i) => i.context === "adhoc"),
    [feed],
  );

  return (
    <div className="space-y-3">
      {/* Activity Detail Sheet */}
      <ActivityDetailSheet
        open={!!detailItem}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null);
        }}
        item={detailItem}
        milestones={milestones}
      />

      {visibleFeed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Plus className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No entries yet.</p>
          <p className="text-xs text-slate-400">Tap + to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleFeed.map((item) => (
            <FeedTile
              key={item.id}
              item={item}
              milestoneMap={milestoneMap}
              allItems={feed}
              onViewActivity={setDetailItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Route a feed item to its tile component */
function FeedTile({
  item,
  milestoneMap,
  allItems,
  onViewActivity,
}: {
  item: FeedItem;
  milestoneMap: Map<string, Milestone>;
  allItems: FeedItem[];
  onViewActivity: (item: FeedItem) => void;
}) {
  switch (item.type) {
    case "observation":
      return <ObservationTile item={item} />;
    case "progress":
      return <ProgressTile item={item} milestoneMap={milestoneMap} />;
    case "diary":
      return <DiaryTile item={item} />;
    case "activity":
      return <ActivityTile item={item} onViewActivity={onViewActivity} />;
    case "report":
      return (
        <ReportTile
          item={item}
          allItems={allItems}
          milestoneMap={milestoneMap}
        />
      );
    case "insight":
      return <InsightTile item={item} />;
    case "custom":
      return <CustomTile item={item} />;
    default:
      return null;
  }
}
