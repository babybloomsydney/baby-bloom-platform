'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

interface TableActiveFilterProps {
  tableKey: string;
}

const ACTIVE_OPTIONS = [1, 3, 7, 14, 30, 60, 90, 180, 365];

export function TableActiveFilter({ tableKey }: TableActiveFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const paramKey = `${tableKey}_active`;
  const currentStr = searchParams.get(paramKey);
  const activeDays = currentStr ? parseInt(currentStr) : null;

  const setActive = useCallback((days: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (days === null) { params.delete(paramKey); } else { params.set(paramKey, String(days)); }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setExpanded(false);
  }, [router, pathname, searchParams, paramKey]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
          activeDays !== null
            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
        }`}
      >
        {activeDays !== null ? `Active ${activeDays}d` : 'Active: All'}
      </button>
      {expanded && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActive(null)}
            className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
              activeDays === null
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {ACTIVE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setActive(d)}
              className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
                activeDays === d
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
