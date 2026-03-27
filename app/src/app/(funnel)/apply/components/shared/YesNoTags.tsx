'use client';

interface YesNoTagsProps {
  selected: boolean | null;
  onChange: (val: boolean | null) => void;
  yesLabel?: string;
  noLabel?: string;
}

export function YesNoTags({ selected, onChange, yesLabel = 'Yes', noLabel = 'No' }: YesNoTagsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { label: yesLabel, value: true as const },
        { label: noLabel, value: false as const },
      ].map(({ label, value }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(selected === value ? null : value)}
          className={`px-3 h-11 rounded-lg border text-sm font-medium flex items-center justify-center cursor-pointer transition-all duration-150 ${
            selected === value
              ? 'bg-violet-500 text-white border-violet-500'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
