"use client";

import { usePathname } from "next/navigation";

// Header lives globally in `KatieShell` (A-07) — this wrapper just
// owns the page surface (bg colour + main padding). The
// distraction-free path list is duplicated in KatieShell to suppress
// the header on those routes.
const DISTRACTION_FREE_PATHS = ["/parent/request"];

export function ParentDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDistractionFree = DISTRACTION_FREE_PATHS.some((p) =>
    pathname.startsWith(p),
  );

  return (
    <div
      className={`flex min-h-full flex-col ${isDistractionFree ? "bg-white" : "bg-slate-50"}`}
    >
      <main className="flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
