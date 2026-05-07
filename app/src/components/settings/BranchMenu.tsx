"use client";

/**
 * Drill-down list of child nodes — the "sub-menu" view rendered
 * when the user lands on a branch (e.g. /settings?s=account, which
 * shows Account's children: Contact details, Verification, …).
 *
 * Each row carries an icon, label, description, optional status
 * badge, and a chevron — same anatomy as iOS Settings rows. Click
 * navigates to that child via `?s=<child-id>`.
 *
 * The component also accepts a `dangerLink` slot used to render a
 * single small hyperlink at the very bottom — for the Account
 * branch, this is "Close account", deliberately understated so
 * the destructive action is reachable but not invitatory.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type SettingsNode, visibleChildren } from "./tree";

interface BranchMenuProps {
  branch: SettingsNode;
  basePath: string;
  /** Optional single bottom hyperlink — small, muted, destructive
   *  affordance. Renders below the children list. Used for the
   *  Account → Close account flow. */
  dangerLink?: { label: string; targetId: string };
}

const STATUS_TONES = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
} as const;

export function BranchMenu({ branch, basePath, dangerLink }: BranchMenuProps) {
  const children = visibleChildren(branch);

  return (
    <div className="space-y-6">
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {children.map((child, i) => {
          const Icon = child.icon;
          const isLast = i === children.length - 1;
          return (
            <li key={child.id}>
              <Link
                href={`${basePath}?s=${child.id}`}
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
                    {child.label}
                  </p>
                  {child.status && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_TONES[child.status.tone],
                      )}
                    >
                      {child.status.label}
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

      {dangerLink && (
        <div className="pt-2 text-center">
          <Link
            href={`${basePath}?s=${dangerLink.targetId}`}
            className="text-xs text-rose-500 underline-offset-2 hover:text-rose-700 hover:underline"
          >
            {dangerLink.label}
          </Link>
        </div>
      )}
    </div>
  );
}
