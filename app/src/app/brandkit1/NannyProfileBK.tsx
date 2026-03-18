"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ExpandableBadges, type TraitBadge } from "./ExpandableBadges";
import {
  MapPin,
  ShieldCheck,
  BadgeCheck,
  Car,
  Baby,
  Globe,
  Clock,
  Heart,
  Check,
  Sparkles,
  Stethoscope,
  CigaretteOff,
  PawPrint,
  Users,
  HandHelping,
  GraduationCap,
  Award,
} from "lucide-react";

// ── Tab definitions ──

const TABS = [
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "availability", label: "Availability" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Availability Grid ──

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SLOT_LABELS = ["Morning", "Midday", "Afternoon", "Evening"];

function AvailabilityGrid({ schedule }: { schedule: Record<string, boolean[]> }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left text-xs font-medium text-slate-400" />
            {SLOT_LABELS.map((label) => (
              <th key={label} className="px-1.5 py-2 text-center text-xs font-medium text-slate-400">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const slots = schedule[day.toLowerCase()] || [false, false, false, false];
            return (
              <tr key={day}>
                <td className="py-1.5 pr-3 font-medium text-slate-600 text-sm whitespace-nowrap">{day.slice(0, 3)}</td>
                {SLOT_LABELS.map((_, i) => (
                  <td key={i} className="px-1.5 py-1.5 text-center">
                    <span className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors",
                      slots[i]
                        ? "bg-violet-500 text-white"
                        : "bg-slate-50 text-slate-200"
                    )}>
                      {slots[i] ? <Check className="h-3.5 w-3.5" /> : "–"}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Verification Badge ──

function VerificationBadge({ level }: { level: number }) {
  if (level >= 4) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-semibold text-green-700">
        <BadgeCheck className="h-3.5 w-3.5" /> Fully Verified
      </span>
    );
  }
  if (level >= 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700">
        <ShieldCheck className="h-3.5 w-3.5" /> ID Verified
      </span>
    );
  }
  return null;
}

// ── Detail Row ──

function DetailRow({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 shrink-0">
        <Icon className="h-4 w-4 text-violet-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}

// ── Glance Item ──

function GlanceItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
      <Icon className="h-4 w-4 text-violet-500 shrink-0" />
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );
}

// ── Build profile trait badges ──

function buildProfileBadges(nanny: NannyProfileBKData): TraitBadge[] {
  const badges: TraitBadge[] = [];
  badges.push({ icon: Clock, label: `${nanny.nanny_experience_years}yrs exp`, variant: "violet" });
  if (nanny.drivers_license) badges.push({ icon: Car, label: "License", variant: "slate" });
  if (nanny.has_car) badges.push({ icon: Car, label: "Car", variant: "slate" });
  if (nanny.vaccination_status) badges.push({ icon: Stethoscope, label: "Vaccinated", variant: "slate" });
  if (nanny.languages.length > 1) {
    const extra = nanny.languages.filter(l => l !== "English");
    badges.push({ icon: Globe, label: `+${extra.length} language, ${extra.join(", ")}`, variant: "slate" });
  }
  if (nanny.comfortable_with_pets) badges.push({ icon: PawPrint, label: "Pet Friendly", variant: "slate" });
  if (nanny.non_smoker) badges.push({ icon: CigaretteOff, label: "Non-Smoker", variant: "slate" });
  return badges;
}

// ── Mock data for the profile ──

export interface NannyProfileBKData {
  first_name: string;
  last_name: string;
  age: number | null;
  suburb: string;
  verification_tier: string;
  verification_level: number;
  profile_picture_url: string | null;
  tagline: string;
  bio: string;
  about: string;
  experience: string;
  strengths: string;
  nationality: string;
  languages: string[];
  min_child_age: string;
  max_child_age: string;
  max_children: number;
  total_experience_years: number;
  nanny_experience_years: number;
  drivers_license: boolean;
  has_car: boolean;
  comfortable_with_pets: boolean;
  vaccination_status: boolean;
  non_smoker: boolean;
  highest_qualification: string | null;
  certificates: string[];
  role_types: string[];
  support_levels: string[];
  schedule: Record<string, boolean[]>;
}

// ── Main Component ──

interface NannyProfileBKProps {
  nanny: NannyProfileBKData;
}

export function NannyProfileBK({ nanny }: NannyProfileBKProps) {
  const [activeTab, setActiveTab] = useState<TabId>("about");

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {/* ── Hero Card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Subtle violet header strip */}
        <div className="h-16 bg-gradient-to-br from-violet-50 to-violet-100/50" />

        <div className="px-5 pb-5">
          {/* Photo — overlaps the header strip */}
          <div className="flex items-end gap-4 -mt-14">
            <div className="relative shrink-0">
              <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-md">
                {nanny.profile_picture_url ? (
                  <Image
                    src={nanny.profile_picture_url}
                    alt={`${nanny.first_name}'s photo`}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-violet-300">
                    {nanny.first_name[0]}
                  </div>
                )}
              </div>
              {(nanny.verification_level ?? 0) >= 3 && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 ring-3 ring-white">
                  <ShieldCheck className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-2xl font-bold text-slate-900">
                {nanny.first_name}{nanny.age ? `, ${nanny.age}` : ""}
              </h1>
              <p className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                <MapPin className="h-3.5 w-3.5" />
                {nanny.suburb}
              </p>
            </div>

            <div className="pb-1 shrink-0">
              <VerificationBadge level={nanny.verification_level ?? 0} />
            </div>
          </div>

          {/* Tagline */}
          {nanny.tagline && (
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              {nanny.tagline}
            </p>
          )}

          {/* Quick trait badges — benefits only */}
          <ExpandableBadges badges={buildProfileBadges(nanny)} />

          {/* CTA */}
          <div className="mt-4">
            <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium h-10">
              Connect with {nanny.first_name}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}

      {/* About Tab */}
      {activeTab === "about" && (
        <div className="space-y-3">
          {/* Bio — editorial feel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-slate-900">About {nanny.first_name}</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {nanny.bio}
            </p>
          </div>

          {/* Strengths — highlighted */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900">Strengths</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {nanny.strengths}
            </p>
          </div>

          {/* Preferences */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Preferences</h3>
            <div className="grid grid-cols-2 gap-2">
              <GlanceItem icon={Baby} label={`Ages ${nanny.min_child_age} – ${nanny.max_child_age}`} />
              <GlanceItem icon={Users} label={`Up to ${nanny.max_children} children`} />
            </div>
          </div>
        </div>
      )}

      {/* Experience Tab */}
      {activeTab === "experience" && (
        <div className="space-y-3">
          {/* Experience summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Experience</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {nanny.experience}
            </p>

            {/* Experience stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-violet-600">{nanny.total_experience_years}</p>
                <p className="text-xs text-slate-500">Years Childcare</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-violet-600">{nanny.nanny_experience_years}</p>
                <p className="text-xs text-slate-500">Years as Nanny</p>
              </div>
            </div>
          </div>

          {/* Qualifications */}
          {(nanny.highest_qualification || nanny.certificates.length > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Qualifications</h3>
              <div className="grid grid-cols-2 gap-2">
                {nanny.highest_qualification && (
                  <GlanceItem icon={GraduationCap} label={nanny.highest_qualification} />
                )}
                {nanny.certificates.map((cert) => (
                  <GlanceItem key={cert} icon={Award} label={cert} />
                ))}
              </div>
            </div>
          )}

          {/* At a Glance */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">At a Glance</h3>
            <div className="grid grid-cols-2 gap-2">
              {nanny.drivers_license && <GlanceItem icon={Car} label="Driver's License" />}
              {nanny.has_car && <GlanceItem icon={Car} label="Car" />}
              {nanny.comfortable_with_pets && <GlanceItem icon={PawPrint} label="Pet Friendly" />}
              {nanny.vaccination_status && <GlanceItem icon={Stethoscope} label="Fully Vaccinated" />}
              {nanny.non_smoker && <GlanceItem icon={CigaretteOff} label="Non-Smoker" />}
              <GlanceItem icon={Globe} label={nanny.nationality} />
            </div>
          </div>
        </div>
      )}

      {/* Availability Tab */}
      {activeTab === "availability" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-slate-900">Weekly Availability</h3>
          </div>
          <AvailabilityGrid schedule={nanny.schedule} />
          <p className="mt-3 text-xs text-slate-400">
            Violet slots indicate when {nanny.first_name} is available. Specific hours can be discussed when connecting.
          </p>
        </div>
      )}
    </div>
  );
}
