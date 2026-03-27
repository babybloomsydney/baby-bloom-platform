'use client';

interface MultiSelectTagsProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  columns?: number;
  max?: number;
}

export function MultiSelectTags({ options, selected, onChange, columns, max }: MultiSelectTagsProps) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((v) => v !== opt));
    } else if (!max || selected.length < max) {
      onChange([...selected, opt]);
    }
  };

  const cols = columns ?? (options.length === 2 ? 2 : options.length <= 5 ? 1 : 2);

  const gridClass =
    cols === 2
      ? 'grid grid-cols-2 gap-2'
      : cols === 3
      ? 'grid grid-cols-3 gap-2'
      : 'flex flex-col gap-2';

  const atMax = max ? selected.length >= max : false;

  return (
    <div className={gridClass}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt);
        const isDisabled = atMax && !isSelected;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            disabled={isDisabled}
            className={`px-3 h-11 rounded-lg border text-sm font-medium flex items-center justify-center transition-all duration-150 ${
              isSelected
                ? 'bg-violet-500 text-white border-violet-500'
                : isDisabled
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
