'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const sourceOptions = [
  { value: '', label: 'All' },
  { value: 'direct', label: 'Direct' },
  { value: 'browse', label: 'Browse' },
  { value: 'profile', label: 'Profile' },
  { value: 'quick_match', label: 'Quick Match' },
  { value: 'advanced_match', label: 'Advanced Match' },
  { value: 'bsr', label: 'BSR' },
  { value: 'position', label: 'Position' },
  { value: 'pricing', label: 'Pricing' },
];

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSource = searchParams.get('source') || '';

  function updateSource(source: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (source) {
      params.set('source', source);
    } else {
      params.delete('source');
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1.5">
      {sourceOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => updateSource(opt.value)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            currentSource === opt.value
              ? 'bg-violet-500 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
