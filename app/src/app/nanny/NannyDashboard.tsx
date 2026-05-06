"use client";

import { usePathname } from "next/navigation";

// Distraction-free paths handle their own bg colour (white). All other
// pages get the standard slate-50 surface. The DashboardNav header is
// rendered globally by `KatieShell` (A-07) so this wrapper no longer
// owns it — that way the header stays put across Katie ↔ BabyBloom
// swaps instead of disappearing with the swap-able main element.
const DISTRACTION_FREE_PATHS = ["/nanny/onboarding-verification"];

export function NannyDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDistractionFree = DISTRACTION_FREE_PATHS.some((p) =>
    pathname.startsWith(p),
  );

  return (
    <div
      className={`flex min-h-full flex-col ${isDistractionFree ? "bg-white" : "bg-slate-50"}`}
    >
      <main className={isDistractionFree ? "flex-1" : "flex-1 p-4 lg:p-6"}>
        {children}
      </main>
    </div>
  );
}
