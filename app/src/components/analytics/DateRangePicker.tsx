'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const presets = [
  { label: 'All Time', from: '', to: '' },
  { label: 'Today', getDates: () => {
    const today = new Date().toISOString().split('T')[0];
    return { from: today, to: today };
  }},
  { label: 'This Week', getDates: () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return { from: monday.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }},
  { label: 'This Month', getDates: () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }},
  { label: 'Last 30 Days', getDates: () => {
    const now = new Date();
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(now.getDate() - 30);
    return { from: thirtyAgo.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }},
] as const;

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentFrom = searchParams.get('from') || '';
  const currentTo = searchParams.get('to') || '';
  const isAllTime = !currentFrom && !currentTo;

  const updateRange = useCallback((from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (from) { params.set('from', from); } else { params.delete('from'); }
    if (to) { params.set('to', to); } else { params.delete('to'); }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  const getActivePreset = () => {
    if (isAllTime) return 'All Time';
    for (const preset of presets) {
      if ('getDates' in preset) {
        const { from, to } = preset.getDates();
        if (from === currentFrom && to === currentTo) return preset.label;
      }
    }
    return null;
  };

  const activePreset = getActivePreset();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      {presets.map((preset) => {
        const isActive = activePreset === preset.label;
        return (
          <button
            key={preset.label}
            onClick={() => {
              if ('getDates' in preset) {
                const { from, to } = preset.getDates();
                updateRange(from, to);
              } else {
                updateRange('', '');
              }
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isActive
                ? 'bg-violet-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {preset.label}
          </button>
        );
      })}

      {/* Separator */}
      <div className="h-5 w-px bg-slate-200 mx-1" />

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-500">From</label>
        <input
          type="date"
          value={currentFrom}
          onChange={(e) => updateRange(e.target.value, currentTo)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-500">To</label>
        <input
          type="date"
          value={currentTo}
          onChange={(e) => updateRange(currentFrom, e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
        />
      </div>
    </div>
  );
}
