"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ImageIcon, Download } from "lucide-react";
import { getLibraryImages } from "@/lib/actions/bapp/library";
import type { FeedItem, Milestone } from "@/types/bapp";
import { ObservationTile } from "./tiles/ObservationTile";
import { ProgressTile } from "./tiles/ProgressTile";
import { DiaryTile } from "./tiles/DiaryTile";
import { ReportTile } from "./tiles/ReportTile";

interface BAppLibraryViewProps {
  childId: string;
  initialImages: FeedItem[];
  initialCursor: string | null;
  milestoneMap?: Map<string, Milestone>;
}

const PAGE_SIZE = 12;

async function downloadImage(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1] || "jpg";
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `baby-bloom-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function DownloadButton({ url, className }: { url: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        downloadImage(url);
      }}
      className={className}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

export function BAppLibraryView({
  childId,
  initialImages,
  initialCursor,
  milestoneMap = new Map(),
}: BAppLibraryViewProps) {
  const [images, setImages] = useState<FeedItem[]>(initialImages);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    const result = await getLibraryImages(childId, cursor, PAGE_SIZE);
    if (result.success) {
      setImages((prev) => [...prev, ...result.data]);
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

  useEffect(() => {
    if (selected) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-400">No photos yet</p>
        <p className="mt-1 text-xs text-slate-300">
          Photos attached to entries will appear here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 3-column grid inside a tile card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 gap-0.5 p-1">
          {images.map((img) => {
            const d = img.data as Record<string, unknown>;
            const url = d.image_url as string;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setSelected(img)}
                className="relative aspect-square overflow-hidden rounded-lg bg-slate-100"
              >
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div ref={sentinelRef} className="h-1" />

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-500" />
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-50 p-3 shadow-xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <TileRenderer
              item={selected}
              allItems={images}
              milestoneMap={milestoneMap}
            />
          </div>
        </div>
      )}
    </>
  );
}

function TileRenderer({
  item,
  allItems,
  milestoneMap,
}: {
  item: FeedItem;
  allItems: FeedItem[];
  milestoneMap: Map<string, Milestone>;
}) {
  switch (item.type) {
    case "observation":
      return <ObservationTile item={item} />;
    case "progress":
      return <ProgressTile item={item} milestoneMap={milestoneMap} />;
    case "diary":
      return <DiaryTile item={item} />;
    case "report":
      return <ReportTile item={item} allItems={allItems} milestoneMap={milestoneMap} />;
    default:
      return <ObservationTile item={item} />;
  }
}
