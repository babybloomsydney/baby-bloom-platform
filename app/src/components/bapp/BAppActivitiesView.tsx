"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Wand2 } from "lucide-react";
import { getActivities } from "@/lib/actions/bapp/activities-feed";
import { ActivityTile } from "./tiles/ActivityTile";
import { ActivityDetailSheet } from "./sheets/ActivityDetailSheet";
import type { FeedItem, Milestone } from "@/types/bapp";

interface BAppActivitiesViewProps {
  childId: string;
  initialItems: FeedItem[];
  initialCursor: string | null;
  milestones: Milestone[];
}

const PAGE_SIZE = 20;

export function BAppActivitiesView({
  childId,
  initialItems,
  initialCursor,
  milestones,
}: BAppActivitiesViewProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<FeedItem | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    const result = await getActivities(childId, cursor, PAGE_SIZE);
    if (result.success) {
      setItems((prev) => [...prev, ...result.data]);
      setCursor(result.nextCursor);
    }
    setLoading(false);
  }, [childId, cursor, loading]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loading) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loading, loadMore]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Wand2 className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-400">No activities yet</p>
        <p className="mt-1 text-xs text-slate-300">
          Plan an activity using the + button
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((item) => (
          <ActivityTile
            key={item.id}
            item={item}
            onViewActivity={setDetailItem}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-1" />

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
        </div>
      )}

      <ActivityDetailSheet
        open={!!detailItem}
        onOpenChange={(open) => { if (!open) setDetailItem(null); }}
        item={detailItem}
        milestones={milestones}
      />
    </>
  );
}
