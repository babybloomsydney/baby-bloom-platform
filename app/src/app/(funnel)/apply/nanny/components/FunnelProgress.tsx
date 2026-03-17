'use client';

import { FunnelStage } from '@/types/nanny-leads';

interface FunnelProgressProps {
  currentStage: FunnelStage;
  currentPage: number;
  totalPages: number;
}

const STAGE_LABELS: Record<FunnelStage, string> = {
  N1: 'Application',
  N2: 'Approval',
  N3: 'Portfolio',
  N4: 'Profile',
  N5: 'Account',
};

const STAGES: FunnelStage[] = ['N1', 'N2', 'N3', 'N4', 'N5'];

export function FunnelProgress({ currentStage, currentPage, totalPages }: FunnelProgressProps) {
  const stageIndex = STAGES.indexOf(currentStage);
  const progressPercent = Math.round(((currentPage + 1) / totalPages) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Stage dots */}
      <div className="flex items-center justify-center gap-1">
        {STAGES.map((stage, i) => {
          const isActive = i === stageIndex;
          const isCompleted = i < stageIndex;

          return (
            <div key={stage} className="flex items-center">
              <div
                className={`flex items-center justify-center transition-all duration-300 ${
                  isActive
                    ? 'text-xs font-semibold text-violet-700 bg-violet-100 px-3 py-1 rounded-full'
                    : isCompleted
                    ? 'w-2 h-2 rounded-full bg-violet-400'
                    : 'w-2 h-2 rounded-full bg-slate-200'
                }`}
              >
                {isActive && STAGE_LABELS[stage]}
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className={`w-6 h-0.5 mx-1 transition-colors duration-300 ${
                    i < stageIndex ? 'bg-violet-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
