"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MapPin, ShieldCheck, Clock, Baby, GraduationCap } from "lucide-react";

export interface NannyPreview {
  id: string;
  first_name: string;
  suburb: string;
  profile_picture_url: string | null;
  age: number | null;
  total_experience_years: number | null;
  under_3_experience_years: number | null;
  newborn_experience_years: number | null;
  highest_qualification: string | null;
  verified: boolean;
  ai_headline: string | null;
}

const QUAL_ABBREV: Record<string, string> = {
  "Bachelor of Early Childhood Education (Or Equivalent)": "Bachelor ECE",
  "Diploma of Early Childhood Education and Care": "Diploma ECEC",
  "Certificate IV in Education Support": "Cert IV Ed Support",
  "Certificate III in Early Childhood Education and Care": "Cert III ECEC",
};

interface NannyPreviewCardProps {
  nanny: NannyPreview;
  linkBase?: string;
  distanceKm?: number | null;
  matchScore?: number | null;
}

export function NannyPreviewCard({ nanny, linkBase = "/nannies", distanceKm, matchScore }: NannyPreviewCardProps) {
  const initials = nanny.first_name[0]?.toUpperCase() ?? "?";

  const traitBadges: { icon: typeof Clock; label: string; primary: boolean }[] = [];
  if (nanny.total_experience_years && nanny.total_experience_years > 0)
    traitBadges.push({ icon: Clock, label: `${nanny.total_experience_years}yrs exp`, primary: true });
  if (nanny.under_3_experience_years && nanny.under_3_experience_years > 0)
    traitBadges.push({ icon: Baby, label: `${nanny.under_3_experience_years}yrs with u3s`, primary: true });
  if (nanny.newborn_experience_years && nanny.newborn_experience_years > 0)
    traitBadges.push({ icon: Baby, label: `${nanny.newborn_experience_years}${nanny.newborn_experience_years === 1 ? 'yr' : 'yrs'} newborns`, primary: true });
  if (nanny.highest_qualification)
    traitBadges.push({ icon: GraduationCap, label: QUAL_ABBREV[nanny.highest_qualification] || nanny.highest_qualification, primary: false });

  return (
    <Link href={`${linkBase}/${nanny.id}`} className="block group">
      <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-violet-200">
        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* Profile picture */}
            <div className="relative shrink-0">
              {nanny.profile_picture_url ? (
                <img
                  src={nanny.profile_picture_url}
                  alt={nanny.first_name}
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                  <span className="text-lg font-semibold text-violet-500">
                    {initials}
                  </span>
                </div>
              )}
              {nanny.verified && (
                <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-green-500 ring-2 ring-white">
                  <ShieldCheck className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-base text-slate-900 truncate group-hover:text-violet-600 transition-colors">
                  {nanny.first_name}{nanny.age ? `, ${nanny.age}` : ""}
                </h3>
                {matchScore != null && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                    matchScore >= 85
                      ? "bg-green-100 text-green-700"
                      : "bg-violet-100 text-violet-700"
                  }`}>
                    {matchScore}% match
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {nanny.suburb}{distanceKm != null ? `, ${distanceKm}km away` : ""}
                </span>
              </div>

              {nanny.ai_headline && (
                <p className="mt-1.5 text-xs text-slate-500 italic">
                  {nanny.ai_headline.replace(/<[^>]*>/g, "")}
                </p>
              )}
            </div>
          </div>

          {/* Badges */}
          {traitBadges.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {traitBadges.map((badge, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    badge.primary
                      ? "bg-violet-50 text-violet-700 border border-violet-200"
                      : "bg-slate-50 text-slate-600 border border-slate-200"
                  }`}
                >
                  <badge.icon className="h-3 w-3" /> {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
