"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface TileHeaderProps {
  icon: LucideIcon;
  iconColor: string;
  badgeText: string;
  authorName: string;
  createdAt: string;
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

/** Format a stable date string for SSR (no relative time) */
function stableDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function TileHeader({
  icon: Icon,
  iconColor,
  badgeText,
  authorName,
  createdAt,
}: TileHeaderProps) {
  // Use stable date on server, switch to relative on client to avoid hydration mismatch
  const [dateText, setDateText] = useState(() => stableDate(createdAt));

  useEffect(() => {
    setDateText(relativeDate(createdAt));
  }, [createdAt]);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          iconColor
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{badgeText}</span>
        <span className="text-xs text-slate-400">{dateText}</span>
      </div>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
        {authorName}
      </span>
    </div>
  );
}
