"use client";

import { Utensils, Baby, Moon, BookOpen } from "lucide-react";
import { TileHeader } from "./TileHeader";
import { TileImage } from "./TileImage";
import type { FeedItem, FoodData, SleepData, UpdateData } from "@/types/bapp";

interface DiaryTileProps {
  item: FeedItem;
}

export function DiaryTile({ item }: DiaryTileProps) {
  // Free-form "Update" diary entry — parent-update note + optional
  // image. Discriminated by `data.subtype === "update"`. Falls
  // through the existing `sleep` / food guards.
  const data = item.data as unknown as FoodData | SleepData | UpdateData;

  if (data.subtype === "update") {
    return <UpdateTile item={item} data={data as UpdateData} />;
  }
  if (data.subtype === "sleep") {
    return <SleepTile item={item} data={data as SleepData} />;
  }

  return <FoodTile item={item} data={data as FoodData} />;
}

function UpdateTile({ item, data }: { item: FeedItem; data: UpdateData }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        // BookOpen — same icon as the diary-entry FAB option in
        // BAppLayout, so the Update tile is visually consistent
        // with the affordance that created it. Violet bg keeps it
        // distinct from orange (food) and indigo (sleep).
        icon={BookOpen}
        iconColor="bg-violet-100 text-violet-600"
        badgeText="Diary Entry"
        authorName={item.author_name}
        createdAt={item.created_at}
        logId={item.id}
      />
      <div className="mt-3 space-y-2">
        {data.image_url && (
          <TileImage src={data.image_url} alt="Diary update" />
        )}
        {data.note && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {data.note}
          </p>
        )}
      </div>
    </div>
  );
}

function FoodTile({ item, data }: { item: FeedItem; data: FoodData }) {
  const isBottle = data.subtype === "bottle";
  const Icon = isBottle ? Baby : Utensils;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={Icon}
        iconColor="bg-orange-100 text-orange-600"
        badgeText="Food Log"
        authorName={item.author_name}
        createdAt={item.created_at}
        logId={item.id}
      />
      <div className="mt-3 space-y-2">
        {data.image_url && <TileImage src={data.image_url} alt="Food" />}
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {data.subtype}
            </span>
            {data.time && (
              <span className="text-xs text-slate-400">{data.time}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {isBottle ? data.quantity : data.details}
          </p>
        </div>
      </div>
    </div>
  );
}

function SleepTile({ item, data }: { item: FeedItem; data: SleepData }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <TileHeader
        icon={Moon}
        iconColor="bg-indigo-100 text-indigo-600"
        badgeText="Sleep Log"
        authorName={item.author_name}
        createdAt={item.created_at}
        logId={item.id}
      />
      <div className="mt-3 space-y-2">
        {data.image_url && <TileImage src={data.image_url} alt="Sleep" />}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Asleep
            </p>
            <p className="text-sm font-medium text-slate-700">{data.start}</p>
          </div>
          <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Awake
            </p>
            <p className="text-sm font-medium text-slate-700">{data.end}</p>
          </div>
        </div>
        {data.duration && (
          <div className="rounded-lg bg-indigo-50 px-3 py-1.5 text-center">
            <span className="text-sm font-medium text-indigo-700">
              {data.duration}
            </span>
          </div>
        )}
        {data.notes && <p className="text-sm text-slate-500">{data.notes}</p>}
      </div>
    </div>
  );
}
