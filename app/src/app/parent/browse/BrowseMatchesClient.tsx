"use client";

import { useState } from "react";
import { NannyMatchCardBK } from "@/app/brandkit1/NannyMatchCardBK";
import type { MatchResult } from "@/lib/matching/types";

type SortKey = "score" | "distance" | "experience" | "qualification";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Best Match" },
  { key: "distance", label: "Distance" },
  { key: "experience", label: "Experience" },
  { key: "qualification", label: "Qualifications" },
];

const QUAL_RANK: Record<string, number> = {
  "Bachelor of Early Childhood Education (Or Equivalent)": 4,
  "Diploma of Early Childhood Education and Care": 3,
  "Certificate IV in Education Support": 2,
  "Certificate III in Early Childhood Education and Care": 1,
};

function sortMatches(matches: MatchResult[], sortBy: SortKey): MatchResult[] {
  const sorted = [...matches];
  switch (sortBy) {
    case "score":
      return sorted.sort((a, b) => b.finalScore - a.finalScore);
    case "distance":
      return sorted.sort((a, b) => {
        const da = a.distanceKm ?? 999;
        const db = b.distanceKm ?? 999;
        return da - db;
      });
    case "experience":
      return sorted.sort((a, b) => {
        const ea =
          b.nanny.nanny_experience_years ??
          b.nanny.total_experience_years ??
          0;
        const eb =
          a.nanny.nanny_experience_years ??
          a.nanny.total_experience_years ??
          0;
        return ea - eb;
      });
    case "qualification":
      return sorted.sort((a, b) => {
        const qa = a.highestQualification ? (QUAL_RANK[a.highestQualification] ?? 0) : 0;
        const qb = b.highestQualification ? (QUAL_RANK[b.highestQualification] ?? 0) : 0;
        return qb - qa;
      });
    default:
      return sorted;
  }
}

interface BrowseMatchesClientProps {
  matches: MatchResult[];
  stats: { totalEligible: number; returned: number };
  children?: React.ReactNode;
}

export function BrowseMatchesClient({ matches, stats, children }: BrowseMatchesClientProps) {
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const sorted = sortMatches(matches, sortBy);

  return (
    <div className="space-y-4">
      {/* Controls row — view toggle (children) + sort toggle */}
      <div className="flex items-center justify-between">
        {children ?? <div />}
        <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {SORT_OPTIONS.map((option) => {
            const isActive = option.key === sortBy;
            return (
              <button
                key={option.key}
                onClick={() => setSortBy(option.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Match list */}
      <div className="space-y-3">
        {sorted.map((match) => (
          <NannyMatchCardBK key={match.nannyId} match={match} />
        ))}
      </div>

      {/* Stats */}
      <p className="text-sm text-slate-400 text-center">
        {stats.returned} match{stats.returned !== 1 ? "es" : ""} found
        {stats.totalEligible > stats.returned &&
          ` out of ${stats.totalEligible} verified nannies`}
      </p>
    </div>
  );
}
