"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { DOMAINS, type DomainCode } from "@/lib/bapp-constants";
import { cn } from "@/lib/utils";
import { MasteryRatingGrid } from "./MasteryRatingGrid";
import { MasteryLabel } from "./MasteryLabel";
import type { Milestone } from "@/types/bapp";

interface MilestoneBrowserProps {
  milestones: Milestone[];
  /** Current progress matrix: {milestoneId: currentScore} */
  progressMatrix?: Record<string, number>;
  /** Already-selected milestones with scores */
  selected: Map<string, number>;
  /** Callback when a milestone is rated */
  onSelect: (milestoneId: string, score: number) => void;
  /** Callback to deselect */
  onDeselect?: (milestoneId: string) => void;
  /** "rating" mode shows mastery grid, "select" mode just toggles selection */
  mode?: "rating" | "select";
  /** Max selections (e.g. 3 for Plan) */
  maxSelections?: number;
}

interface GroupedMilestones {
  domain: string;
  ageBrackets: {
    bracket: string;
    milestones: Milestone[];
  }[];
}

function groupMilestones(milestones: Milestone[]): GroupedMilestones[] {
  const domainMap = new Map<
    string,
    Map<string, Milestone[]>
  >();

  for (const m of milestones) {
    if (!domainMap.has(m.domain)) {
      domainMap.set(m.domain, new Map());
    }
    const bracketMap = domainMap.get(m.domain)!;
    if (!bracketMap.has(m.age_bracket)) {
      bracketMap.set(m.age_bracket, []);
    }
    bracketMap.get(m.age_bracket)!.push(m);
  }

  const result: GroupedMilestones[] = [];
  for (const [domain, bracketMap] of Array.from(domainMap)) {
    const ageBrackets: { bracket: string; milestones: Milestone[] }[] = [];
    for (const [bracket, ms] of Array.from(bracketMap)) {
      ageBrackets.push({ bracket, milestones: ms });
    }
    result.push({ domain, ageBrackets });
  }

  return result;
}

const DOMAIN_BG: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200",
  pink: "bg-pink-50 border-pink-200",
  green: "bg-green-50 border-green-200",
  purple: "bg-purple-50 border-purple-200",
  orange: "bg-orange-50 border-orange-200",
  teal: "bg-teal-50 border-teal-200",
  amber: "bg-amber-50 border-amber-200",
};

export function MilestoneBrowser({
  milestones,
  progressMatrix = {},
  selected,
  onSelect,
  onDeselect,
  mode = "rating",
  maxSelections,
}: MilestoneBrowserProps) {
  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);

  const grouped = useMemo(() => groupMilestones(milestones), [milestones]);

  const atLimit = maxSelections != null && selected.size >= maxSelections;

  return (
    <div className="space-y-2">
      {grouped.map(({ domain, ageBrackets }) => {
        const domainInfo = DOMAINS[domain as DomainCode];
        const color = domainInfo?.color ?? "blue";
        const isOpen = openDomain === domain;

        return (
          <div
            key={domain}
            className={cn(
              "overflow-hidden rounded-lg border transition-colors",
              isOpen ? DOMAIN_BG[color] : "border-slate-200 bg-white"
            )}
          >
            {/* Domain header */}
            <button
              type="button"
              onClick={() => {
                setOpenDomain(isOpen ? null : domain);
                setExpandedMilestone(null);
              }}
              className="flex w-full items-center justify-between px-3 py-2.5"
            >
              <span className="text-sm font-medium text-slate-800">
                {domainInfo?.label ?? domain}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {/* Domain content */}
            {isOpen && (
              <div className="space-y-3 px-3 pb-3">
                {ageBrackets.map(({ bracket, milestones: bracketMs }) => (
                  <div key={bracket}>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                      {bracket}
                    </p>
                    <div className="space-y-1.5">
                      {bracketMs.map((m) => {
                        const isSelected = selected.has(m.id);
                        const currentScore = progressMatrix[m.id] ?? 0;
                        const selectedScore = selected.get(m.id) ?? null;
                        const isExpanded = expandedMilestone === m.id;

                        // In select mode, hide already-selected items
                        if (mode === "select" && isSelected) return null;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              "rounded-lg border p-2.5 transition-colors",
                              isSelected
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-slate-200 bg-white"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (mode === "select") {
                                  if (!atLimit) onSelect(m.id, 0);
                                  return;
                                }
                                if (isSelected && onDeselect) {
                                  onDeselect(m.id);
                                  setExpandedMilestone(null);
                                } else if (!isSelected) {
                                  setExpandedMilestone(
                                    isExpanded ? null : m.id
                                  );
                                }
                              }}
                              disabled={mode === "select" && atLimit}
                              className="flex w-full items-start justify-between gap-2 text-left"
                            >
                              <span className="text-sm text-slate-700">
                                {m.description}
                              </span>
                              <span className="flex-shrink-0">
                                {isSelected && selectedScore ? (
                                  <MasteryLabel score={selectedScore} />
                                ) : currentScore > 0 ? (
                                  <MasteryLabel score={currentScore} />
                                ) : null}
                              </span>
                            </button>

                            {/* Inline mastery grid (rating mode only) */}
                            {mode === "rating" && isExpanded && !isSelected && (
                              <div className="mt-2">
                                <MasteryRatingGrid
                                  selectedScore={null}
                                  onSelect={(score) => {
                                    onSelect(m.id, score);
                                    setExpandedMilestone(null);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
