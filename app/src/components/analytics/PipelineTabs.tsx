'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { CustomPipelineBuilder, type CatalogCategory } from './CustomPipelineBuilder';
import { ChartBuilder } from './ChartBuilder';

const TABS = [
  { key: 'metrics', label: 'Key Metrics' },
  { key: 'custom', label: 'Custom' },
  { key: 'charts', label: 'Charts' },
] as const;

interface PipelineTabsProps {
  children: React.ReactNode;
  catalog: CatalogCategory[];
  customStages: { label: string; tooltip?: string; total: number; liveTotal?: number; tags?: ('N' | 'P' | 'T' | 'V')[]; override?: { count?: 'all' | 'unique'; min?: number; max?: number; mode?: 'alltime' | 'live' }; medianDwell?: number | null }[];
}

function TabsInner({ children, catalog, customStages }: PipelineTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = (searchParams.get('tab') as typeof TABS[number]['key']) || 'metrics';

  function setTab(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'metrics') {
      params.delete('tab');
    } else {
      params.set('tab', key);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <>
      <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              current === tab.key
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {current === 'metrics' && children}

      {current === 'custom' && (
        <CustomPipelineBuilder catalog={catalog} customStages={customStages} />
      )}

      {current === 'charts' && (
        <ChartBuilder catalog={catalog} />
      )}
    </>
  );
}

export function PipelineTabs({ children, catalog, customStages }: PipelineTabsProps) {
  return (
    <Suspense fallback={null}>
      <TabsInner catalog={catalog} customStages={customStages}>{children}</TabsInner>
    </Suspense>
  );
}
