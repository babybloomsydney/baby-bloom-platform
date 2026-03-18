"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MapPin, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickMatchResults } from "./QuickMatchResults";
import type { NannyPreview } from "./NannyPreviewCard";

interface SuburbEntry {
  suburb: string;
  postcode: string;
}

interface QuickMatchNanny extends NannyPreview {
  logistical_score: number;
  distance_km: number | null;
  schedule_overlap_percent: number;
}

interface QuickMatchResponse {
  totalMatches: number;
  topNannies: QuickMatchNanny[];
}

// Matches parent form constants exactly
const DAY_OPTIONS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};
// Map display day → API key (lowercase)
const DAY_KEY: Record<string, string> = {
  Monday: "monday", Tuesday: "tuesday", Wednesday: "wednesday", Thursday: "thursday",
  Friday: "friday", Saturday: "saturday", Sunday: "sunday",
};

const TIME_BLOCKS = [
  { key: "morning", label: "Morning", sublabel: "6am – 10am" },
  { key: "midday", label: "Midday", sublabel: "10am – 2pm" },
  { key: "afternoon", label: "Afternoon", sublabel: "2pm – 6pm" },
  { key: "evening", label: "Evening", sublabel: "6pm – 10pm" },
];

export function QuickMatch() {
  // Suburb autocomplete state
  const [suburbs, setSuburbs] = useState<SuburbEntry[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<SuburbEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSuburb, setSelectedSuburb] = useState<SuburbEntry | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Availability state — matches parent form pattern: select days, then time blocks per day
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const timesRef = useRef<HTMLDivElement>(null);

  // Results state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QuickMatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  // Load suburbs on mount
  useEffect(() => {
    fetch("/api/sydney-postcodes")
      .then((res) => res.json())
      .then((d: SuburbEntry[]) => setSuburbs(d))
      .catch(() => {});
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuburbChange = (val: string) => {
    setQuery(val);
    setSelectedSuburb(null);
    if (val.trim().length >= 2) {
      const q = val.toLowerCase().trim();
      const matches = suburbs
        .filter((s) => s.suburb.toLowerCase().includes(q) || s.postcode.includes(q))
        .slice(0, 8);
      setFiltered(matches);
      setShowDropdown(matches.length > 0);
    } else {
      setFiltered([]);
      setShowDropdown(false);
    }
  };

  const handleSuburbSelect = (entry: SuburbEntry) => {
    setQuery(`${entry.suburb}, ${entry.postcode}`);
    setShowDropdown(false);
    setSelectedSuburb(entry);
    setPrompt(null);
  };

  const toggleDay = useCallback((day: string) => {
    setPrompt(null);
    const key = DAY_KEY[day];
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        // Deselect — also remove that day's time blocks
        setAvailability((a) => {
          const next = { ...a };
          delete next[key];
          return next;
        });
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  }, []);

  const toggleTimeBlock = useCallback((day: string, blockKey: string) => {
    setPrompt(null);
    const key = DAY_KEY[day];
    setAvailability((prev) => {
      const current = prev[key] ?? [];
      const updated = current.includes(blockKey)
        ? current.filter((b) => b !== blockKey)
        : [...current, blockKey];
      return { ...prev, [key]: updated };
    });
  }, []);

  // Auto-scroll when time grid appears
  useEffect(() => {
    if (selectedDays.length > 0 && timesRef.current) {
      timesRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [selectedDays.length]);

  // Sort selected days in week order
  const sortedSelectedDays = DAY_OPTIONS.filter((d) => selectedDays.includes(d));

  // Every selected day must have at least one time block
  const allDaysHaveBrackets =
    sortedSelectedDays.length > 0 &&
    sortedSelectedDays.every((day) => {
      const blocks = availability[DAY_KEY[day]] ?? [];
      return blocks.length > 0;
    });

  const canSearch = selectedSuburb !== null && allDaysHaveBrackets;

  const handleSearch = async () => {
    if (!canSearch || !selectedSuburb) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/public/quick-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suburb: selectedSuburb.suburb,
          availability,
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch matches");

      const data: QuickMatchResponse = await res.json();
      setResults(data);

      // Store in sessionStorage for advanced matchmaking flow
      sessionStorage.setItem(
        "bb-quick-match",
        JSON.stringify({
          suburb: selectedSuburb.suburb,
          postcode: selectedSuburb.postcode,
          availability,
        })
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Show results view
  if (results) {
    return (
      <QuickMatchResults
        suburb={selectedSuburb!.suburb}
        totalMatches={results.totalMatches}
        topNannies={results.topNannies}
        onReset={() => setResults(null)}
      />
    );
  }

  return (
    <section id="quick-match" className="relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-20 right-[10%] w-72 h-72 bg-violet-100 rounded-full blur-3xl opacity-50" />
      <div className="absolute bottom-10 left-[5%] w-48 h-48 bg-violet-200 rounded-full blur-2xl opacity-30" />

      <div className="container mx-auto px-4 md:px-6 pt-16 pb-12 md:pt-24 md:pb-16">
        {/* Hero text */}
        <div className="max-w-3xl mx-auto text-center relative z-10 mb-10">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
            Childcare that nourishes futures
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            Education-focused nannies. Expertly matched. Free for families.
          </p>
        </div>

        {/* Match form */}
        <div className="max-w-[560px] mx-auto relative z-10">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-6 md:p-8 space-y-5">
            {/* Suburb input */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Suburb
              </label>
              <div className="relative" ref={dropdownRef}>
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSuburbChange(e.target.value)}
                  onFocus={() => {
                    if (filtered.length > 0) setShowDropdown(true);
                  }}
                  placeholder="e.g. Bondi, Surry Hills, Manly..."
                  className="w-full h-11 pl-10 pr-4 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-colors"
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute z-50 bottom-full mb-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                    {filtered.map((entry) => (
                      <button
                        key={`${entry.suburb}-${entry.postcode}`}
                        type="button"
                        onClick={() => handleSuburbSelect(entry)}
                        className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                      >
                        {entry.suburb}, {entry.postcode}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Day + time selection — matches parent form pattern */}
            {selectedSuburb && (
            <div className="space-y-4">
              <label className="text-sm font-medium text-slate-700 block">
                Which days do you need childcare?
              </label>

              {/* Day selection — 4 + 3 grid, matches DaysTimesCompound */}
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-2">
                  {DAY_OPTIONS.slice(0, 4).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-2 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 ${
                        selectedDays.includes(day)
                          ? "bg-violet-500 text-white border-violet-500"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {DAY_SHORT[day]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DAY_OPTIONS.slice(4).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-2 py-2.5 rounded-lg border text-sm font-medium text-center transition-all duration-150 ${
                        selectedDays.includes(day)
                          ? "bg-violet-500 text-white border-violet-500"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {DAY_SHORT[day]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time bracket grid — appears once days are selected */}
              {sortedSelectedDays.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-slate-700 text-center">
                    When during the day?
                  </p>

                  <div className="overflow-x-auto">
                    <div className="min-w-[320px]">
                      {/* Column headers */}
                      <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1">
                        <div />
                        {TIME_BLOCKS.map((block) => (
                          <div key={block.key} className="text-center">
                            <p className="text-[11px] font-semibold text-slate-600">
                              {block.label}
                            </p>
                            <p className="text-[9px] text-slate-400">
                              {block.sublabel}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Day rows */}
                      {sortedSelectedDays.map((day) => {
                        const currentTimes = availability[DAY_KEY[day]] ?? [];
                        return (
                          <div
                            key={day}
                            className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1"
                          >
                            <div className="flex items-center">
                              <p className="text-xs font-semibold text-slate-600">
                                {DAY_SHORT[day]}
                              </p>
                            </div>
                            {TIME_BLOCKS.map((block) => {
                              const isSelected = currentTimes.includes(block.key);
                              return (
                                <button
                                  key={block.key}
                                  type="button"
                                  onClick={() => toggleTimeBlock(day, block.key)}
                                  className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                                    isSelected
                                      ? "bg-violet-500 text-white border-violet-500"
                                      : "bg-white text-slate-400 border-slate-200 hover:border-violet-400"
                                  }`}
                                >
                                  {isSelected ? "\u2713" : ""}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div ref={timesRef} />
            </div>
            )}

            {/* CTA */}
            <Button
              className="w-full bg-violet-500 hover:bg-violet-600 h-11 text-sm"
              disabled={loading}
              onClick={() => {
                if (!selectedSuburb) {
                  setPrompt("Enter your suburb to get started");
                  return;
                }
                if (selectedDays.length === 0) {
                  setPrompt("Select the days you need childcare");
                  return;
                }
                if (!allDaysHaveBrackets) {
                  setPrompt("Choose time slots for your selected days");
                  return;
                }
                setPrompt(null);
                handleSearch();
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finding nannies...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find Nannies
                </>
              )}
            </Button>

            {prompt && (
              <p className="text-xs text-violet-500 text-center">{prompt}</p>
            )}

            {error && (
              <p className="text-xs text-red-500 text-center">{error}</p>
            )}

          </div>

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-violet-500" />
              <span>WWCC verified</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-violet-500" />
              <span>Expertly vetted</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-violet-500" />
              <span>Developmental focused</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
