"use client";

import { MASTERY_LABELS, type MasteryScore } from "@/lib/bapp-constants";
import { cn } from "@/lib/utils";

const SCORE_COLORS: Record<number, string> = {
  0: "bg-slate-100 text-slate-500",
  1: "bg-blue-100 text-blue-700",
  2: "bg-indigo-100 text-indigo-700",
  3: "bg-emerald-100 text-emerald-700",
  4: "bg-emerald-500 text-white",
};

interface MasteryLabelProps {
  score: number;
  className?: string;
}

export function MasteryLabel({ score, className }: MasteryLabelProps) {
  const label = MASTERY_LABELS[score as MasteryScore] ?? "Unknown";
  const colors = SCORE_COLORS[score] ?? SCORE_COLORS[0];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors,
        className
      )}
    >
      {label}
    </span>
  );
}
