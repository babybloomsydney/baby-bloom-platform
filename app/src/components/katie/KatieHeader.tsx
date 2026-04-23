"use client";

/**
 * Top bar of Katie's deck. Left wordmark, right hamburger.
 * In carousel mode the hamburger is a swap control.
 */

import { Menu } from "lucide-react";
import { useKatie } from "@/contexts/KatieContext";

export function KatieHeader() {
  const { showMain } = useKatie();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-baseline gap-1.5 text-sm">
        <span className="font-semibold text-violet-700">BabyBloom</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-900">Katie</span>
      </div>
      <button
        type="button"
        onClick={showMain}
        aria-label="Back to site"
        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}
