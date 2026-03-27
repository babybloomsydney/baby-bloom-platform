'use client';

interface SingleSelectTagsProps {
  options: string[];
  selected: string | null;
  onChange: (val: string | null) => void;
  columns?: number;
}

export function SingleSelectTags({ options, selected, onChange, columns }: SingleSelectTagsProps) {
  const cols = columns ?? (options.length === 2 ? 2 : options.length <= 5 ? 1 : 2);

  const gridClass =
    cols === 2
      ? 'grid grid-cols-2 gap-2'
      : cols === 3
      ? 'grid grid-cols-3 gap-2'
      : 'flex flex-col gap-2';

  return (
    <div className={gridClass}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(selected === opt ? null : opt)}
          className={`px-3 h-11 rounded-lg border text-sm font-medium flex items-center justify-center cursor-pointer transition-all duration-150 ${
            selected === opt
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
