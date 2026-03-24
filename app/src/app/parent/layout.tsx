import type { Metadata } from 'next';
import { ParentDashboard } from './ParentDashboard';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <ParentDashboard>{children}</ParentDashboard>;
}
