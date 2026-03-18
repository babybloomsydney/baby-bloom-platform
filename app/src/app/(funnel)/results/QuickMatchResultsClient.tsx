"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { NannyPreviewCard } from "@/components/landing/NannyPreviewCard";
import type { NannyPreview } from "@/components/landing/NannyPreviewCard";

interface QuickMatchNanny extends NannyPreview {
  logistical_score: number;
  distance_km: number | null;
  schedule_overlap_percent: number;
}

interface QuickMatchResponse {
  totalMatches: number;
  topNannies: QuickMatchNanny[];
}

const MATCHING_FACTORS = [
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
];

export function QuickMatchResultsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [suburb, setSuburb] = useState("");
  const [results, setResults] = useState<QuickMatchResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("bb-quick-match");
    if (!raw) {
      router.replace("/");
      return;
    }

    let parsed: { suburb: string; postcode: string; availability: Record<string, string[]> };
    try {
      parsed = JSON.parse(raw);
      if (!parsed.suburb || !parsed.availability) {
        router.replace("/");
        return;
      }
    } catch {
      router.replace("/");
      return;
    }

    setSuburb(parsed.suburb);

    fetch("/api/public/quick-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suburb: parsed.suburb,
        availability: parsed.availability,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data: QuickMatchResponse) => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto" />
          <p className="mt-4 text-sm text-slate-500">Finding nannies near {suburb || "you"}...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Something went wrong. Please try again.</p>
          <Button
            className="mt-4 bg-violet-500 hover:bg-violet-600"
            onClick={() => router.push("/")}
          >
            Back to search
          </Button>
        </div>
      </div>
    );
  }

  const { totalMatches, topNannies } = results;

  return (
    <div className="min-h-screen bg-white relative">
      {/* Decorative background */}
      <div className="absolute top-20 right-[10%] w-72 h-72 bg-violet-100 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-10 left-[5%] w-48 h-48 bg-violet-200 rounded-full blur-2xl opacity-30" />

      <div className="relative z-10 py-12 md:py-16">
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
                  {MATCHING_FACTORS.map((item) => (
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
                onClick={() => router.push("/")}
                className="flex items-center justify-center gap-1.5 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
              >
                <RotateCcw className="h-3 w-3" />
                Search again
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
