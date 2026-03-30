'use client';

import { usePathname } from 'next/navigation';
import { DashboardNav } from '@/components/layout/DashboardNav';

const DISTRACTION_FREE_PATHS = ['/nanny/onboarding-verification'];

export function NannyDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDistractionFree = DISTRACTION_FREE_PATHS.some(p => pathname.startsWith(p));

  return (
    <div className={`flex min-h-screen flex-col ${isDistractionFree ? 'bg-white' : 'bg-slate-50'}`}>
      {!isDistractionFree && <DashboardNav role="nanny" />}
      <main className={isDistractionFree ? 'flex-1' : 'flex-1 p-4 lg:p-6'}>{children}</main>
    </div>
  );
}
