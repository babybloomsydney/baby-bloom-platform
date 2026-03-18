"use client";

import { SelectOption } from "../questions";

interface SingleSelectProps {
  options: SelectOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  columns?: number;
}

export function SingleSelect({
  options,
  selected,
  onSelect,
  columns,
}: SingleSelectProps) {
  const handleClick = (value: string) => {
    if (selected === value) {
      onSelect(null); // Toggle off
    } else {
      onSelect(value);
    }
  };

  // Auto-detect columns: 2 options = 2 cols, otherwise use provided or 1
  const cols =
    columns ?? (options.length === 2 ? 2 : options.length <= 5 ? 1 : 2);

  const gridClass =
    cols === 2
      ? "grid grid-cols-2 gap-2"
      : cols === 3
      ? "grid grid-cols-3 gap-2"
      : "flex flex-col gap-2";

  return (
    <div className={gridClass}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => handleClick(opt.value)}
          className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
            selected === opt.value
              ? "bg-violet-500 text-white border-violet-500"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
