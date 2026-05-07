"use client";

/**
 * Breadcrumb trail rendered above a leaf section's content. Each
 * crumb except the last is a navigable link back up the tree;
 * the last crumb is the active section title and is rendered
 * non-interactively.
 *
 * Walks any depth — the array is the result of `findNode(...)`
 * traversed root-to-leaf.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { type SettingsNode } from "./tree";

interface SettingsBreadcrumbProps {
  basePath: string;
  /** Path from root to the active node, in order. The last entry
   *  is the active node itself. */
  path: SettingsNode[];
  /** Label for the synthetic root crumb (e.g. "Settings"). */
  rootLabel: string;
}

export function SettingsBreadcrumb({
  basePath,
  path,
  rootLabel,
}: SettingsBreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
    >
      <Link href={basePath} className="hover:text-violet-700 hover:underline">
        {rootLabel}
      </Link>
      {path.map((n, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={n.id} className="flex items-center gap-1">
            <ChevronRight
              className="h-3 w-3 text-slate-300"
              aria-hidden="true"
            />
            {isLast ? (
              <span className="font-medium text-slate-700">{n.label}</span>
            ) : (
              <Link
                href={`${basePath}?s=${n.id}`}
                className="hover:text-violet-700 hover:underline"
              >
                {n.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
