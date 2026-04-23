"use client";

import { cn } from "@/lib/utils";
import { MASTERY_LABELS } from "@/lib/bapp-constants";

interface MasteryRatingGridProps {
  selectedScore: number | null;
  onSelect: (score: number) => void;
}

const SCORES = [1, 2, 3, 4] as const;

export function MasteryRatingGrid({
  selectedScore,
  onSelect,
}: MasteryRatingGridProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SCORES.map((score) => (
        <button
          key={score}
          type="button"
          onClick={() => onSelect(score)}
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            selectedScore === score
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {MASTERY_LABELS[score]}
        </button>
      ))}
    </div>
  );
}
