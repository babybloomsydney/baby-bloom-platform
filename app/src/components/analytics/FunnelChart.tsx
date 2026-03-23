interface FunnelStage {
  label: string;
  count: number;
}

interface FunnelChartProps {
  title: string;
  stages: FunnelStage[];
}

export function FunnelChart({ title, stages }: FunnelChartProps) {
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
      )}
      <div className="space-y-1.5">
        {stages.map((stage, index) => {
          const pctOfTotal = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          const prevCount = index > 0 ? stages[index - 1].count : null;
          const interStageRate = prevCount && prevCount > 0
            ? Math.round((stage.count / prevCount) * 100)
            : null;
          const barWidth = Math.max(pctOfTotal, 3);

          return (
            <div key={stage.label}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-medium text-slate-600">{stage.label}</span>
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="font-bold text-slate-900">{stage.count}</span>
                  <span className="text-slate-400">{Math.round(pctOfTotal)}%</span>
                  {interStageRate !== null && (
                    <span className={interStageRate < 50 ? 'text-amber-500' : 'text-emerald-500'}>
                      {interStageRate}%
                    </span>
                  )}
                </div>
              </div>
              {/* Bar */}
              <div className="h-5 rounded bg-slate-100">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: `rgba(139, 92, 246, ${Math.max(0.9 - index * 0.07, 0.2)})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-1">
        <span>% of top</span>
        <span className="text-slate-300">|</span>
        <span className="text-emerald-400">% from prev</span>
      </div>
    </div>
  );
}
