'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export interface RowOverride {
  count?: 'all' | 'unique';
  min?: number;
  max?: number;
  mode?: 'alltime' | 'live';
}

interface RowFilterPopoverProps {
  tableKey: string;
  rowIndex: number;
  rowLabel: string;
  current?: RowOverride;
  hasLiveTotal?: boolean;
  onClose: () => void;
}

export function parseRowOverrides(param: string): Record<number, RowOverride> {
  if (!param) return {};
  const result: Record<number, RowOverride> = {};
  for (const part of param.split(',')) {
    const parts = part.split('.');
    const idx = parts[0], c = parts[1], mn = parts[2], mx = parts[3], md = parts[4];
    if (idx === undefined) continue;
    const override: RowOverride = {};
    if (c === 'a') override.count = 'all';
    else if (c === 'u') override.count = 'unique';
    if (mn && mn !== '-') override.min = parseInt(mn);
    if (mx && mx !== '-') override.max = parseInt(mx);
    if (md === 'l') override.mode = 'live';
    else if (md === 't') override.mode = 'alltime';
    if (override.count !== undefined || override.min !== undefined || override.max !== undefined || override.mode !== undefined) {
      result[parseInt(idx)] = override;
    }
  }
  return result;
}

function serializeRowOverrides(overrides: Record<number, RowOverride>): string {
  return Object.entries(overrides)
    .map(([idx, o]) => {
      const c = o.count === 'all' ? 'a' : o.count === 'unique' ? 'u' : '-';
      const mn = o.min !== undefined ? String(o.min) : '-';
      const mx = o.max !== undefined ? String(o.max) : '-';
      const md = o.mode === 'live' ? 'l' : o.mode === 'alltime' ? 't' : '-';
      // Trim trailing dashes
      let s = `${idx}.${c}.${mn}.${mx}.${md}`;
      while (s.endsWith('.-')) s = s.slice(0, -2);
      return s;
    })
    .join(',');
}

export function RowFilterPopover({
  tableKey,
  rowIndex,
  rowLabel,
  current,
  hasLiveTotal,
  onClose,
}: RowFilterPopoverProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);

  const [countEnabled, setCountEnabled] = useState(current?.count !== undefined);
  const [countMode, setCountMode] = useState<'all' | 'unique'>(current?.count || 'all');
  const [minEnabled, setMinEnabled] = useState(current?.min !== undefined);
  const [minVal, setMinVal] = useState(current?.min ?? 1);
  const [maxEnabled, setMaxEnabled] = useState(current?.max !== undefined);
  const [maxVal, setMaxVal] = useState(current?.max ?? 10);
  const [modeEnabled, setModeEnabled] = useState(current?.mode !== undefined);
  const [modeVal, setModeVal] = useState<'alltime' | 'live'>(current?.mode || 'alltime');

  // Close on click outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  function save() {
    const paramKey = `${tableKey}_rows`;
    const existing = parseRowOverrides(searchParams.get(paramKey) || '');

    const override: RowOverride = {};
    if (countEnabled) override.count = countMode;
    if (minEnabled) override.min = minVal;
    if (maxEnabled) override.max = maxVal;
    if (modeEnabled) override.mode = modeVal;

    if (override.count !== undefined || override.min !== undefined || override.max !== undefined || override.mode !== undefined) {
      existing[rowIndex] = override;
    } else {
      delete existing[rowIndex];
    }

    const params = new URLSearchParams(searchParams.toString());
    const serialized = serializeRowOverrides(existing);
    if (serialized) {
      params.set(paramKey, serialized);
    } else {
      params.delete(paramKey);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    onClose();
  }

  function reset() {
    const paramKey = `${tableKey}_rows`;
    const existing = parseRowOverrides(searchParams.get(paramKey) || '');
    delete existing[rowIndex];

    const params = new URLSearchParams(searchParams.toString());
    const serialized = serializeRowOverrides(existing);
    if (serialized) {
      params.set(paramKey, serialized);
    } else {
      params.delete(paramKey);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-56"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] font-semibold text-slate-500 mb-2 truncate">
        {rowLabel}
      </p>

      {/* Count Mode */}
      <div className="mb-2.5">
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={countEnabled}
            onChange={(e) => setCountEnabled(e.target.checked)}
            className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
          />
          <span className={`text-[10px] font-medium ${countEnabled ? 'text-slate-700' : 'text-slate-400'}`}>
            Count Mode
          </span>
        </label>
        {countEnabled && (
          <div className="flex rounded-md border border-slate-200 overflow-hidden ml-4">
            <button
              onClick={() => setCountMode('unique')}
              className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                countMode === 'unique'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              Unique
            </button>
            <button
              onClick={() => setCountMode('all')}
              className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                countMode === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              All
            </button>
          </div>
        )}
      </div>

      {/* Time Mode (only shown when liveTotal available) */}
      {hasLiveTotal && (
        <div className="mb-2.5">
          <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={modeEnabled}
              onChange={(e) => setModeEnabled(e.target.checked)}
              className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
            />
            <span className={`text-[10px] font-medium ${modeEnabled ? 'text-slate-700' : 'text-slate-400'}`}>
              Time Mode
            </span>
          </label>
          {modeEnabled && (
            <div className="flex rounded-md border border-slate-200 overflow-hidden ml-4">
              <button
                onClick={() => setModeVal('alltime')}
                className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                  modeVal === 'alltime'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                All-time
              </button>
              <button
                onClick={() => setModeVal('live')}
                className={`px-2 py-0.5 text-[9px] font-medium transition-colors ${
                  modeVal === 'live'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Live
              </button>
            </div>
          )}
        </div>
      )}

      {/* Min Count */}
      <div className="mb-2.5">
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={minEnabled}
            onChange={(e) => setMinEnabled(e.target.checked)}
            className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
          />
          <span className={`text-[10px] font-medium ${minEnabled ? 'text-slate-700' : 'text-slate-400'}`}>
            Min Count
          </span>
        </label>
        {minEnabled && (
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => setMinVal(Math.max(0, minVal - 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              value={minVal}
              onChange={(e) => setMinVal(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-10 h-5 text-center text-[10px] border border-slate-200 rounded tabular-nums"
            />
            <button
              onClick={() => setMinVal(minVal + 1)}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Max Count */}
      <div className="mb-3">
        <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
          <input
            type="checkbox"
            checked={maxEnabled}
            onChange={(e) => setMaxEnabled(e.target.checked)}
            className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
          />
          <span className={`text-[10px] font-medium ${maxEnabled ? 'text-slate-700' : 'text-slate-400'}`}>
            Max Count
          </span>
        </label>
        {maxEnabled && (
          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => setMaxVal(Math.max(0, maxVal - 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              value={maxVal}
              onChange={(e) => setMaxVal(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-10 h-5 text-center text-[10px] border border-slate-200 rounded tabular-nums"
            />
            <button
              onClick={() => setMaxVal(maxVal + 1)}
              className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button
          onClick={reset}
          className="text-[10px] text-slate-400 hover:text-slate-600 font-medium"
        >
          Reset
        </button>
        <button
          onClick={save}
          className="px-3 py-1 text-[10px] font-medium bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
