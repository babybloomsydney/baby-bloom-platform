'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

interface TableDatePickerProps {
  tableKey: string;
}

const presets = [
  { label: 'Global', clear: true },
  { label: 'All Time', getDates: () => ({ from: '1970-01-01', to: '' }) },
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
  { label: 'Last 30d', getDates: () => {
    const now = new Date();
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(now.getDate() - 30);
    return { from: thirtyAgo.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }},
] as const;

export function TableDatePicker({ tableKey }: TableDatePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const fromKey = `${tableKey}_from`;
  const toKey = `${tableKey}_to`;
  const currentFrom = searchParams.get(fromKey) || '';
  const currentTo = searchParams.get(toKey) || '';
  const hasCustomRange = !!currentFrom || !!currentTo;

  const updateRange = useCallback((from: string, to: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (from) { params.set(fromKey, from); } else { params.delete(fromKey); }
    if (to) { params.set(toKey, to); } else { params.delete(toKey); }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams, fromKey, toKey]);

  const clearRange = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(fromKey);
    params.delete(toKey);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams, fromKey, toKey]);

  const getActivePreset = () => {
    if (!hasCustomRange) return 'Global';
    for (const preset of presets) {
      if ('getDates' in preset) {
        const { from, to } = preset.getDates();
        if (from === currentFrom && to === currentTo) return preset.label;
      }
    }
    if (currentFrom === '1970-01-01' && !currentTo) return 'All Time';
    return null;
  };

  const activePreset = getActivePreset();

  return (
    <div className="flex items-center gap-1.5">
      {/* Active range indicator / toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
          hasCustomRange
            ? 'bg-violet-50 text-violet-600 hover:bg-violet-100'
            : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
        }`}
      >
        {activePreset || 'Custom'}
        {hasCustomRange && !expanded && (
          <span className="ml-1 text-[9px] opacity-60">
            {currentFrom && currentFrom !== '1970-01-01' ? currentFrom : ''}
            {currentFrom && currentTo ? ' → ' : ''}
            {currentTo || ''}
          </span>
        )}
      </button>

      {/* Expanded picker */}
      {expanded && (
        <div className="flex items-center gap-1">
          {presets.map((preset) => {
            const isActive = activePreset === preset.label;
            return (
              <button
                key={preset.label}
                onClick={() => {
                  if ('clear' in preset) {
                    clearRange();
                  } else {
                    const { from, to } = preset.getDates();
                    updateRange(from, to);
                  }
                  setExpanded(false);
                }}
                className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
                  isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <input
            type="date"
            value={currentFrom === '1970-01-01' ? '' : currentFrom}
            onChange={(e) => updateRange(e.target.value, currentTo)}
            className="h-5 rounded border border-slate-200 bg-white px-1 text-[9px] text-slate-600 focus:border-violet-400 focus:outline-none w-[100px]"
          />
          <input
            type="date"
            value={currentTo}
            onChange={(e) => updateRange(currentFrom, e.target.value)}
            className="h-5 rounded border border-slate-200 bg-white px-1 text-[9px] text-slate-600 focus:border-violet-400 focus:outline-none w-[100px]"
          />
        </div>
      )}
    </div>
  );
}
