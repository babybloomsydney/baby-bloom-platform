import type { Metadata } from 'next';
import { NannyDashboard } from './NannyDashboard';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NannyLayout({ children }: { children: React.ReactNode }) {
  return <NannyDashboard>{children}</NannyDashboard>;
}
