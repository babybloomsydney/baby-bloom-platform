"use client";

import { MapPin, ShieldCheck, Clock, Baby, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calcAge } from "@/components/match/match-helpers";
import type { MatchResult } from "@/lib/matching/types";

interface PublicMatchCardProps {
  match: MatchResult;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[80px] text-xs text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PublicMatchCard({ match }: PublicMatchCardProps) {
  const { nanny, profile, breakdown } = match;
  const initials = `${profile.first_name[0]}${profile.last_name[0]}`;
  const nannyAge = calcAge(profile.date_of_birth);
  const aiContent = nanny.ai_content as Record<string, unknown> | null;
  const headline = (aiContent?.headline as string) || null;

  return (
    <div className="relative h-full rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-violet-200 transition-all flex flex-col">
      <div className="p-4 flex flex-col h-full">
        {/* Profile header */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {profile.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={profile.first_name}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                <span className="text-lg font-semibold text-violet-500">
                  {initials}
                </span>
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-green-500 ring-2 ring-white flex items-center justify-center">
              <ShieldCheck className="w-3 h-3 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-base text-slate-900 leading-tight">
                {profile.first_name}
                {nannyAge ? `, ${nannyAge}` : ""}
              </h3>
              <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border bg-green-100 text-green-700 border-green-200">
                {match.finalScore}%
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>
                {profile.suburb}
                {match.distanceKm != null &&
                  (match.distanceKm < 1
                    ? ", <1km away"
                    : `, ${match.distanceKm}km away`)}
              </span>
            </div>
          </div>
        </div>

        {/* Headline */}
        {headline && (
          <p className="mt-3 text-sm text-slate-500 italic leading-relaxed">
            {headline.replace(/<[^>]*>/g, "")}
          </p>
        )}

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {nanny.nanny_experience_years != null &&
            nanny.nanny_experience_years > 0 && (
              <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700">
                <Clock className="mr-1 h-3 w-3" />
                {nanny.nanny_experience_years}yrs exp
              </Badge>
            )}
          {nanny.under_3_experience_years != null &&
            nanny.under_3_experience_years > 0 && (
              <Badge variant="secondary" className="text-xs bg-violet-100 text-violet-700">
                <Baby className="mr-1 h-3 w-3" />
                {nanny.under_3_experience_years}yrs with u3s
              </Badge>
            )}
        </div>
        {match.highestQualification &&
          match.highestQualification !== "No Qualifications" && (
            <div className="mt-1.5">
              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                <GraduationCap className="mr-1 h-3 w-3" />
                {match.highestQualification}
              </Badge>
            </div>
          )}

        {/* Push score bars to bottom */}
        <div className="flex-1 min-h-3" />

        {/* Score bars */}
        <div className="space-y-2 pt-2 border-t border-slate-100 mt-3">
          <ScoreBar label="Experience" value={breakdown.experience} />
          <ScoreBar label="Schedule" value={breakdown.schedule} />
          <ScoreBar label="Location" value={breakdown.location} />
        </div>
      </div>
    </div>
  );
}
