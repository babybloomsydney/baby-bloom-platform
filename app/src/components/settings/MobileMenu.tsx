"use client";

/**
 * Mobile root-menu — shown when the URL is at the settings root
 * with no `?s=` param. Lists top-level nodes only (sub-items live
 * inside their parent's drill-down view, accessed by tapping a
 * top-level row).
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type SettingsNode, visibleChildren } from "./tree";

const STATUS_TONES = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
} as const;

interface MobileMenuProps {
  basePath: string;
  tree: SettingsNode[];
}

export function MobileMenu({ basePath, tree }: MobileMenuProps) {
  const items = tree.filter((n) => !n.hidden);
  return (
    <div className="lg:hidden">
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.map((n, i) => {
          const isLast = i === items.length - 1;
          const Icon = n.icon;
          return (
            <li key={n.id}>
              <Link
                href={`${basePath}?s=${n.id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 active:bg-slate-100/70",
                  !isLast && "border-b border-slate-100",
                )}
              >
                {Icon && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-1 items-center gap-2 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {n.label}
                  </p>
                  {n.status && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_TONES[n.status.tone],
                      )}
                    >
                      {n.status.label}
                    </span>
                  )}
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-300"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
