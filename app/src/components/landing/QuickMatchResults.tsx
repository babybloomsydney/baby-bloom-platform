"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { NannyPreviewCard } from "./NannyPreviewCard";
import type { NannyPreview } from "./NannyPreviewCard";

interface QuickMatchNanny extends NannyPreview {
  logistical_score: number;
  distance_km: number | null;
  schedule_overlap_percent: number;
}

interface QuickMatchResultsProps {
  suburb: string;
  totalMatches: number;
  topNannies: QuickMatchNanny[];
  onReset: () => void;
}

export function QuickMatchResults({
  suburb,
  totalMatches,
  topNannies,
  onReset,
}: QuickMatchResultsProps) {
  return (
    <section id="quick-match" className="py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl mx-auto">
          {/* Results header */}
          <div className="text-center mb-8">
            {totalMatches > 0 ? (
              <>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                  {totalMatches} match{totalMatches !== 1 ? "es" : ""} near {suburb}
                </h2>
                <p className="mt-2 text-slate-500 text-sm">
                  Matched by location and schedule.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                  No exact matches in {suburb}
                </h2>
                <p className="mt-2 text-slate-500 text-sm">
                  Adjust availability or try advanced matchmaking.
                </p>
              </>
            )}
          </div>

          {/* Top nanny cards */}
          {topNannies.length > 0 && (
            <div className="space-y-3 mb-8">
              {topNannies.map((nanny) => (
                <NannyPreviewCard
                  key={nanny.id}
                  nanny={nanny}
                  distanceKm={nanny.distance_km}
                  matchScore={nanny.logistical_score}
                />
              ))}
            </div>
          )}

          {/* CTAs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            {totalMatches > 0 && (
              <Button asChild className="w-full bg-violet-500 hover:bg-violet-600 h-11 text-sm">
                <Link href="/signup">
                  See all matches
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
                <p className="text-sm font-medium text-slate-900">
                  Advanced matchmaking. 12 factors. Top matches contacted directly.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4 pl-6">
                {[
                  "Location & proximity",
                  "Schedule compatibility",
                  "Years of experience",
                  "Newborn & toddler experience",
                  "Qualifications & certifications",
                  "Role fit & care style",
                  "Child age range",
                  "Developmental support level",
                  "Driver's licence & car",
                  "Language preferences",
                  "Vaccination status",
                  "Pet comfort",
                ].map((item) => (
                  <p key={item} className="text-xs text-slate-500">
                    <span className="text-violet-500 font-medium">+</span> {item}
                  </p>
                ))}
              </div>
              <p className="text-xs text-slate-400 mb-3 pl-6">
                Top matches contacted directly.
              </p>
              <Button
                asChild
                variant="outline"
                className="w-full h-11 text-sm border-slate-200"
              >
                <Link href="/matchmaking/onboarding">
                  Advanced Matchmaking
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <button
              onClick={onReset}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              <RotateCcw className="h-3 w-3" />
              Search again
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
