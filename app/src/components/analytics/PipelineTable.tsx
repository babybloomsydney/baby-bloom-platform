'use client';

import { useState, useMemo, Suspense } from 'react';
import { TableDatePicker } from './TableDatePicker';
import { TableCountToggle } from './TableCountToggle';
import { TableActiveFilter } from './TableActiveFilter';
import { RowFilterPopover, type RowOverride } from './RowFilterPopover';

interface PipelineStage {
  label: string;
  total: number;
  liveTotal?: number;
  live?: number;
  tooltip?: string;
  tags?: ('N' | 'P' | 'T' | 'V')[];
  override?: RowOverride;
  medianDwell?: number | null;
}

interface PipelineTableProps {
  title: string;
  subtitle?: string;
  metricType: 'cumulative' | 'current';
  stages: PipelineStage[];
  /** Per-entity timestamp arrays for time calculations.
   *  Each inner array has one entry per stage (null if not reached).
   *  Outer array = one per user/connection entity. */
  timestamps?: (number | null)[][];
  /** When provided, enables a Total/Live toggle in the header. */
  liveStages?: PipelineStage[];
  liveTimestamps?: (number | null)[][];
  /** When provided, renders a per-table date picker in the header. */
  tableKey?: string;
  /** When provided, shows a remove button per row (custom tab). */
  onRemoveStage?: (index: number) => void;
  /** When provided, enables drag-and-drop reordering. */
  onReorderStage?: (fromIndex: number, toIndex: number) => void;
  /** Hide the per-table date picker. */
  hideDatePicker?: boolean;
  /** Hide the per-table active filter. */
  hideActiveFilter?: boolean;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fmtTime(ms: number | null): string {
  if (ms === null) return '--';
  const mins = ms / 60_000;
  if (mins < 1) return '<1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 24) {
    const h = Math.floor(hrs);
    const m = Math.round((hrs - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = hrs / 24;
  if (days < 30) {
    const d = Math.floor(days);
    const h = Math.round((days - d) * 24);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  const months = days / 30.44;
  return `${Math.round(months * 10) / 10}mo`;
}

export function PipelineTable({
  title,
  subtitle,
  metricType,
  stages,
  timestamps,
  liveStages,
  liveTimestamps,
  tableKey,
  onRemoveStage,
  onReorderStage,
  hideDatePicker,
  hideActiveFilter,
}: PipelineTableProps) {
  const hasToggle = !!liveStages;
  const hasLiveTotal = stages.some(s => s.liveTotal !== undefined);
  const [mode, setMode] = useState<'total' | 'live'>('total');
  const [timeMode, setTimeMode] = useState<'alltime' | 'live'>('alltime');
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(stages.map((_, i) => i))
  );
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const baseStages = mode === 'live' && liveStages ? liveStages : stages;

  // Apply All-time/Live mode: swap total with liveTotal per row
  const activeStages = useMemo(() => {
    if (!hasLiveTotal) return baseStages;
    return baseStages.map(s => {
      const effectiveMode = s.override?.mode ?? timeMode;
      if (effectiveMode === 'live' && s.liveTotal !== undefined) {
        return { ...s, total: s.liveTotal };
      }
      return s;
    });
  }, [baseStages, timeMode, hasLiveTotal]);
  const activeTimestamps =
    mode === 'live' && liveTimestamps
      ? liveTimestamps
      : mode === 'live'
        ? undefined
        : timestamps;
  const activeMetricType =
    mode === 'live' ? 'current' as const : metricType;

  const hasTimeData = activeTimestamps && activeTimestamps.length > 0;
  const hasPrecomputedDwell = stages.some(s => s.medianDwell !== undefined && s.medianDwell !== null);
  const showTimeColumns = hasTimeData || hasPrecomputedDwell;

  function toggleRow(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const rows = useMemo(() => {
    const selArr = Array.from(selected).sort((a, b) => a - b);
    const firstSelTotal =
      selArr.length > 0 ? activeStages[selArr[0]]?.total ?? 0 : 0;

    return activeStages.map((stage, i) => {
      const isSel = selected.has(i);

      // ── % of Total (relative to first selected) ──
      const pctTotal =
        isSel && firstSelTotal > 0
          ? Math.round((stage.total / firstSelTotal) * 100)
          : null;

      // ── % from Prev (nearest selected above) ──
      let pctPrev: number | null = null;
      if (isSel) {
        const above = selArr.filter((idx) => idx < i);
        if (above.length > 0) {
          const prevTotal = activeStages[above[above.length - 1]]?.total ?? 0;
          pctPrev =
            prevTotal > 0
              ? Math.round((stage.total / prevTotal) * 100)
              : null;
        }
      }

      // ── Ratio to Start (how many of first selected make 1 of this) ──
      const ratioStart =
        isSel && firstSelTotal > 0 && stage.total > 0
          ? firstSelTotal / stage.total
          : null;

      // ── Ratio to Prev (how many of nearest selected above make 1 of this) ──
      let ratioPrev: number | null = null;
      if (isSel) {
        const above = selArr.filter((idx) => idx < i);
        if (above.length > 0) {
          const prevTotal = activeStages[above[above.length - 1]]?.total ?? 0;
          ratioPrev =
            prevTotal > 0 && stage.total > 0
              ? prevTotal / stage.total
              : null;
        }
      }

      // ── Live (provided or computed as total_this - total_next) ──
      const live =
        stage.live !== undefined
          ? stage.live
          : i < activeStages.length - 1
            ? Math.max(0, stage.total - activeStages[i + 1].total)
            : stage.total;

      // ── Drop-off % (to next selected row) ──
      let dropoff: number | null = null;
      if (isSel && stage.total > 0) {
        const below = selArr.filter((idx) => idx > i);
        if (below.length > 0) {
          const nextTotal = activeStages[below[0]]?.total ?? 0;
          dropoff = Math.round(((stage.total - nextTotal) / stage.total) * 100);
        }
      }

      // ── Time calculations ──
      let timeFromStart: number | null = null;
      let timeFromPrev: number | null = null;
      let dwell: number | null = null;

      if (hasTimeData) {
        const ts = activeTimestamps!;

        // Time from start → recalculates based on selection
        if (isSel && selArr.length > 0 && selArr[0] !== i) {
          const startIdx = selArr[0];
          const diffs: number[] = [];
          for (const row of ts) {
            if (row[startIdx] != null && row[i] != null) {
              diffs.push(row[i]! - row[startIdx]!);
            }
          }
          timeFromStart = median(diffs);
        }

        // Time from prev → recalculates based on selection
        if (isSel) {
          const above = selArr.filter((idx) => idx < i);
          if (above.length > 0) {
            const prevIdx = above[above.length - 1];
            const diffs: number[] = [];
            for (const row of ts) {
              if (row[prevIdx] != null && row[i] != null) {
                diffs.push(row[i]! - row[prevIdx]!);
              }
            }
            timeFromPrev = median(diffs);
          }
        }

        // Dwell time → fixed (always consecutive stages, not affected by selection)
        if (i < activeStages.length - 1) {
          const nextIdx = i + 1;
          const diffs: number[] = [];
          for (const row of ts) {
            if (row[i] != null && row[nextIdx] != null) {
              diffs.push(row[nextIdx]! - row[i]!);
            }
          }
          dwell = median(diffs);
        }
      } else if (stage.medianDwell !== undefined) {
        // Fallback: use pre-computed dwell from source funnel
        dwell = stage.medianDwell;
      }

      return {
        ...stage,
        isSel,
        pctTotal,
        pctPrev,
        ratioStart,
        ratioPrev,
        live,
        dropoff,
        timeFromStart,
        timeFromPrev,
        dwell,
      };
    });
  }, [activeStages, selected, activeTimestamps, hasTimeData]);

  return (
    <div>
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                activeMetricType === 'cumulative'
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {activeMetricType}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tableKey && (
              <>
                {!hideDatePicker && (
                  <Suspense fallback={null}>
                    <TableDatePicker tableKey={tableKey} />
                  </Suspense>
                )}
                {!hideActiveFilter && (
                  <Suspense fallback={null}>
                    <TableActiveFilter tableKey={tableKey} />
                  </Suspense>
                )}
                <Suspense fallback={null}>
                  <TableCountToggle tableKey={tableKey} />
                </Suspense>
              </>
            )}
          {hasToggle && (
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              <button
                onClick={() => setMode('total')}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  mode === 'total'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Total
              </button>
              <button
                onClick={() => setMode('live')}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  mode === 'live'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Live
              </button>
            </div>
          )}
          {hasLiveTotal && (
            <div className="flex rounded-md border border-slate-200 overflow-hidden">
              <button
                onClick={() => setTimeMode('alltime')}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  timeMode === 'alltime'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                All-time
              </button>
              <button
                onClick={() => setTimeMode('live')}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  timeMode === 'live'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                Live
              </button>
            </div>
          )}
          </div>
        </div>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Table */}
      <div className={`-mx-1 ${editingRow !== null ? '' : 'overflow-x-auto'}`}>
        <table className="w-full text-[11px] min-w-[600px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60">
              {onReorderStage && <th className="w-5 py-2 px-0" />}
              <th className="w-7 py-2 px-1 text-center">
                <input
                  type="checkbox"
                  checked={selected.size === activeStages.length}
                  ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < activeStages.length; }}
                  onChange={() => {
                    setSelected(
                      selected.size === activeStages.length
                        ? new Set<number>()
                        : new Set(activeStages.map((_, i) => i))
                    );
                  }}
                  className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
                />
              </th>
              <th className="text-left py-2 px-2 font-medium text-slate-500">
                Stage
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                Total
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                % Total
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                % Prev
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                1:Start
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                1:Prev
              </th>
              {showTimeColumns && (
                <>
                  <th className="text-right py-2 px-2 font-medium text-slate-500">
                    From Start
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-slate-500">
                    From Prev
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-slate-500">
                    Dwell
                  </th>
                </>
              )}
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                Live
              </th>
              <th className="text-right py-2 px-2 font-medium text-slate-500">
                Drop-off
              </th>
              {onRemoveStage && (
                <th className="w-16 py-2 px-1" />
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => toggleRow(i)}
                draggable={!!onReorderStage}
                onDragStart={onReorderStage ? (e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(i));
                } : undefined}
                onDragOver={onReorderStage ? (e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverIndex(i);
                } : undefined}
                onDragLeave={onReorderStage ? (e) => {
                  const related = e.relatedTarget as Node | null;
                  if (related && (e.currentTarget as Node).contains(related)) return;
                  setDragOverIndex(prev => prev === i ? null : prev);
                } : undefined}
                onDrop={onReorderStage ? (e) => {
                  e.preventDefault();
                  if (dragIndex !== null && dragIndex !== i) {
                    onReorderStage(dragIndex, i);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                } : undefined}
                onDragEnd={onReorderStage ? () => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                } : undefined}
                className={`border-b border-slate-100 cursor-pointer transition-opacity hover:bg-slate-50 ${
                  r.isSel ? '' : 'opacity-25'
                } ${dragIndex === i ? 'opacity-30' : ''} ${
                  dragOverIndex === i && dragIndex !== i ? 'border-t-2 border-t-violet-400' : ''
                }`}
              >
                {/* Drag handle */}
                {onReorderStage && (
                  <td className="py-2 px-0 text-center" onClick={(e) => e.stopPropagation()}>
                    <span className="w-4 h-4 flex items-center justify-center text-[10px] text-slate-300 cursor-grab active:cursor-grabbing select-none mx-auto">
                      ⠿
                    </span>
                  </td>
                )}

                {/* Checkbox */}
                <td className="py-2 px-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.isSel}
                    onChange={() => toggleRow(i)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3 h-3 rounded border-slate-300 text-violet-500 focus:ring-violet-400"
                  />
                </td>

                {/* Stage */}
                <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap relative">
                  {r.tags && r.tags.map((t, ti) => (
                    <span key={ti} className={`text-[8px] font-bold mr-0.5 inline-block w-3 text-center ${
                      t === 'N' ? 'text-blue-400' : t === 'P' ? 'text-pink-400' : t === 'T' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {t}
                    </span>
                  ))}
                  {r.label}
                  {r.tooltip && (
                    <span className="relative group/tip inline-flex ml-1.5 align-middle">
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-100 text-slate-400 text-[8px] font-semibold cursor-help leading-none">i</span>
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 hidden group-hover/tip:block bg-slate-800 text-white text-[10px] font-normal px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg pointer-events-none">
                        {r.tooltip}
                      </span>
                    </span>
                  )}
                  {r.override && (
                    <span className="text-[9px] text-slate-400 font-normal ml-1">
                      ({[
                        r.override.count,
                        r.override.min !== undefined ? `≥${r.override.min}` : null,
                        r.override.max !== undefined ? `≤${r.override.max}` : null,
                        r.override.mode,
                      ].filter(Boolean).join(', ')})
                    </span>
                  )}
                  {tableKey && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingRow(editingRow === i ? null : i); }}
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 ml-1 align-middle rounded text-[8px] transition-colors ${
                        r.override
                          ? 'bg-violet-100 text-violet-500'
                          : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      ⚙
                    </button>
                  )}
                  {tableKey && editingRow === i && (
                    <Suspense fallback={null}>
                      <RowFilterPopover
                        tableKey={tableKey}
                        rowIndex={i}
                        rowLabel={r.label}
                        current={r.override}
                        hasLiveTotal={r.liveTotal !== undefined}
                        onClose={() => setEditingRow(null)}
                      />
                    </Suspense>
                  )}
                </td>

                {/* Total */}
                <td className="py-2 px-2 text-right font-bold text-slate-900 tabular-nums">
                  {r.total}
                </td>

                {/* % Total */}
                <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                  {r.pctTotal !== null ? `${r.pctTotal}%` : '--'}
                </td>

                {/* % Prev */}
                <td className="py-2 px-2 text-right tabular-nums">
                  {r.pctPrev !== null ? (
                    <span
                      className={
                        r.pctPrev < 50 ? 'text-amber-500' : 'text-emerald-500'
                      }
                    >
                      {r.pctPrev}%
                    </span>
                  ) : (
                    <span className="text-slate-300">--</span>
                  )}
                </td>

                {/* Ratio to Start */}
                <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                  {r.ratioStart !== null && r.ratioStart !== 1
                    ? `${Math.round(r.ratioStart * 10) / 10}:1`
                    : r.ratioStart === 1
                      ? '1:1'
                      : '--'}
                </td>

                {/* Ratio to Prev */}
                <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                  {r.ratioPrev !== null && r.ratioPrev !== 1
                    ? `${Math.round(r.ratioPrev * 10) / 10}:1`
                    : r.ratioPrev === 1
                      ? '1:1'
                      : '--'}
                </td>

                {/* Time columns (conditional) */}
                {showTimeColumns && (
                  <>
                    <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                      {fmtTime(r.timeFromStart)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                      {fmtTime(r.timeFromPrev)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500 tabular-nums">
                      {fmtTime(r.dwell)}
                    </td>
                  </>
                )}

                {/* Live */}
                <td className="py-2 px-2 text-right font-medium text-slate-700 tabular-nums">
                  {r.live}
                </td>

                {/* Drop-off */}
                <td className="py-2 px-2 text-right tabular-nums">
                  {r.dropoff !== null ? (
                    <span
                      className={
                        r.dropoff > 50 ? 'text-red-400' : 'text-slate-400'
                      }
                    >
                      {r.dropoff}%
                    </span>
                  ) : (
                    <span className="text-slate-300">--</span>
                  )}
                </td>

                {/* Remove button (custom tab) */}
                {onRemoveStage && (
                  <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onRemoveStage(i)}
                      className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
