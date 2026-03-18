"use client";

import { Button } from "@/components/ui/button";
import { SelectOption } from "../questions";

interface MultiSelectProps {
  options: SelectOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onAdvance: () => void;
  columns?: number;
}

export function MultiSelect({
  options,
  selected,
  onToggle,
  onAdvance,
  columns,
}: MultiSelectProps) {
  const cols = columns ?? (options.length === 2 ? 2 : 1);

  const gridClass =
    cols === 2
      ? "grid grid-cols-2 gap-2"
      : cols === 3
      ? "grid grid-cols-3 gap-2"
      : "flex flex-col gap-2";

  return (
    <div className="flex flex-col gap-3">
      <div className={gridClass}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
              selected.includes(opt.value)
                ? "bg-violet-500 text-white border-violet-500"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <Button
          onClick={onAdvance}
          className="mt-1 w-full h-11 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium text-sm"
        >
          Continue
        </Button>
      )}
    </div>
  );
}
