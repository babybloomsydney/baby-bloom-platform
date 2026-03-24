'use client';

import { DashboardNav } from '@/components/layout/DashboardNav';

export function ParentDashboard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <DashboardNav role="parent" />
      <main className="flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
