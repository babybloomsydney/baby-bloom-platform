'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

interface TableCountToggleProps {
  tableKey: string;
}

export function TableCountToggle({ tableKey }: TableCountToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramKey = `${tableKey}_count`;
  const current = searchParams.get(paramKey) === 'all' ? 'all' : 'unique';

  const setMode = useCallback((mode: 'all' | 'unique') => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === 'unique') { params.delete(paramKey); } else { params.set(paramKey, mode); }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams, paramKey]);

  return (
    <div className="flex rounded-md border border-slate-200 overflow-hidden">
      <button
        onClick={() => setMode('unique')}
        className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
          current === 'unique'
            ? 'bg-slate-800 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        Unique
      </button>
      <button
        onClick={() => setMode('all')}
        className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
          current === 'all'
            ? 'bg-slate-800 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        All
      </button>
    </div>
  );
}
