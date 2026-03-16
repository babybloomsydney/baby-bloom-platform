"use client";

import { useState } from "react";
import Link from "next/link";
import {
  User,
  ChevronUp,
  ChevronDown,
  Pencil,
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
  GraduationCap,
  Award,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NannyPositionsClient, type Placement } from "./positions/NannyPositionsClient";
import { NannyBabysittingClient } from "./babysitting/NannyBabysittingClient";
import type { NannyBabysittingJob } from "@/lib/actions/babysitting";
import type { UpcomingIntro } from "@/lib/actions/position-funnel";
import type { DfyNotification } from "@/lib/actions/matching";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VerificationData } from "@/lib/actions/verification";

// ── Availability Grid (matches NannyProfileBK exactly) ──────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SLOT_LABELS = ["Morning", "Midday", "Afternoon", "Evening"];
const TIME_SLOTS = ["Morning (6am-10am)", "Midday (10am-2pm)", "Afternoon (2pm-6pm)", "Evening (6pm-10pm)"] as const;
const SLOT_RANGES = [
  { start: 6, end: 10 },
  { start: 10, end: 14 },
  { start: 14, end: 18 },
  { start: 18, end: 22 },
];

function normaliseDaySlots(raw: unknown): boolean[] {
  if (!raw) return [false, false, false, false];
  if (Array.isArray(raw)) {
    return TIME_SLOTS.map((slot) => raw.includes(slot));
  }
  if (typeof raw === "object" && raw !== null && "available" in raw) {
    const obj = raw as { available?: boolean; start?: string | null; end?: string | null };
    if (!obj.available || !obj.start || !obj.end) return [false, false, false, false];
    const startHour = parseInt(obj.start.split(":")[0]);
    const endHour = parseInt(obj.end.split(":")[0]);
    return SLOT_RANGES.map((range) => startHour <= range.start && endHour >= range.end);
  }
  return [false, false, false, false];
}

function AvailabilityGrid({ schedule, firstName }: { schedule: Record<string, unknown>; firstName: string }) {
  return (
    <>
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
              const rawEntry = schedule[day.toLowerCase()];
              const slots = normaliseDaySlots(rawEntry);
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
      <p className="mt-3 text-xs text-slate-400">
        Violet slots indicate when {firstName} is available. Specific hours can be discussed when connecting.
      </p>
    </>
  );
}

// ── Glance Item (matches NannyProfileBK) ─────────────────────────────────────

function GlanceItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
      <Icon className="h-4 w-4 text-violet-500 shrink-0" />
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ageMonthsToLabel(months: number | null | undefined): string {
  if (months === null || months === undefined) return "Any";
  if (months === 0) return "Newborn";
  if (months < 12) return `${months}mo`;
  const y = Math.floor(months / 12);
  return `${y}yr${y > 1 ? "s" : ""}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NannyProfileAccordionData {
  suburb: string;
  date_of_birth: string | null;
  nationality: string | null;
  total_experience_years: number | null;
  nanny_experience_years: number | null;
  under_3_experience_years: number | null;
  newborn_experience_years: number | null;
  role_types_preferred: string[] | null;
  level_of_support_offered: string[] | null;
  hourly_rate_min: number | null;
  max_children: number | null;
  min_child_age_months: number | null;
  max_child_age_months: number | null;
  drivers_license: boolean | null;
  has_car: boolean | null;
  comfortable_with_pets: boolean | null;
  vaccination_status: boolean | null;
  non_smoker: boolean | null;
  languages: string[] | null;
  hobbies_interests: string | null;
  strengths_traits: string | null;
  skills_training: string | null;
  ai_content: Record<string, unknown> | null;
  availability: { days_available: string[] | null; schedule: Record<string, string[]> | null } | null;
  highest_qualification: string | null;
  certificates: string[];
}

interface NannyHubClientProps {
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  verificationLevel: number;
  verificationData: VerificationData | null;
  nannyProfile: NannyProfileAccordionData | null;
  placements: Placement[];
  upcomingIntros: UpcomingIntro[];
  dfyNotifications: DfyNotification[];
  babysittingJobs: NannyBabysittingJob[];
  bsrBanned: boolean;
  bsrBanUntil: string | null;
  shareUnlocked: boolean;
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type MainTabId = "verification" | "nannying" | "babysitting";

const PROFILE_TABS = [
  { id: "about" as const, label: "About" },
  { id: "experience" as const, label: "Experience" },
  { id: "availability" as const, label: "Availability" },
];
type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

// ══════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export function NannyHubClient({
  firstName,
  profilePictureUrl,
  verificationLevel,
  verificationData,
  nannyProfile,
  placements,
  upcomingIntros,
  dfyNotifications,
  babysittingJobs,
  bsrBanned,
  bsrBanUntil,
  shareUnlocked,
}: NannyHubClientProps) {
  // ── Verification locking ──
  const isTabsLocked = verificationLevel < 3;
  const isCardsLocked = verificationLevel < 4;

  const [activeTab, setActiveTab] = useState<MainTabId>(isTabsLocked ? "verification" : "nannying");
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTabId>("about");
  const [showTabLockedModal, setShowTabLockedModal] = useState(false);
  const [showCardLockedModal, setShowCardLockedModal] = useState(false);

  const p = nannyProfile;
  const ai = p?.ai_content;
  const age = computeAge(p?.date_of_birth ?? null);

  // AI content extraction
  const bioSummary = ai?.bio_summary;
  const bioSummaryObj = (typeof bioSummary === "object" && bioSummary !== null ? bioSummary : null) as Record<string, string> | null;
  const bio = (ai?.parent_pitch as string) || bioSummaryObj?.about || null;
  const strengths = bioSummaryObj?.strengths || p?.strengths_traits || null;
  const experienceText = (ai?.experience_summary as string) || null;
  const tagline = (ai?.headline as string) || null;

  // Verification — numeric level (1-4), badge shows at 3+
  const isVerified = verificationLevel >= 3;

  // Build trait badges for hero card
  const traitBadges: { icon: React.ElementType; label: string; primary?: boolean }[] = [];
  if (p) {
    if (p.nanny_experience_years) traitBadges.push({ icon: Clock, label: `${p.nanny_experience_years} yrs experience`, primary: true });
    if (p.under_3_experience_years && p.under_3_experience_years > 0) traitBadges.push({ icon: Baby, label: `${p.under_3_experience_years} yrs under 3s`, primary: true });
    if (p.newborn_experience_years && p.newborn_experience_years > 0) traitBadges.push({ icon: Baby, label: `${p.newborn_experience_years} yrs newborns`, primary: true });
    if (p.highest_qualification) traitBadges.push({ icon: GraduationCap, label: p.highest_qualification });
    for (const cert of p.certificates) {
      traitBadges.push({ icon: Award, label: cert });
    }
    if (p.has_car) traitBadges.push({ icon: Car, label: "Car" });
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          HERO CARD — mirrors NannyProfileBK hero exactly
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Gradient header strip */}
        <div className="h-16 bg-gradient-to-br from-violet-50 to-violet-100/50" />

        <div className="px-5 pb-5">
          {/* Photo + Name + Verification — overlaps header by -mt-14 */}
          <div className="flex items-end gap-4 -mt-14">
            <div className="relative shrink-0">
              <div className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-md">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt={`${firstName}'s photo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-violet-300">
                    {firstName[0]}
                  </div>
                )}
              </div>
              {isVerified && (
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 ring-3 ring-white">
                  <ShieldCheck className="h-4 w-4 text-white" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-2xl font-bold text-slate-900">
                {firstName}{age ? `, ${age}` : ""}
              </h1>
              {p?.suburb && (
                <p className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {p.suburb}
                </p>
              )}
            </div>

            <div className="pb-1 shrink-0">
              {isVerified && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-semibold text-green-700">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified
                </span>
              )}
            </div>
          </div>

          {/* Short bio */}
          {tagline && (
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{tagline.replace(/<\/?p>/g, "")}</p>
          )}

          {/* Trait badges */}
          {traitBadges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {traitBadges.map((badge, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    badge.primary
                      ? "bg-violet-50 text-violet-700 border border-violet-200"
                      : "bg-slate-50 text-slate-600 border border-slate-200"
                  )}
                >
                  <badge.icon className="h-3 w-3" />
                  {badge.label}
                </span>
              ))}
            </div>
          )}

          {/* "Childcare Profile" accordion toggle */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setProfileExpanded((prev) => !prev)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-white font-medium text-sm transition-colors h-10"
            >
              <User className="h-4 w-4" />
              Childcare Profile
              {profileExpanded ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ACCORDION — Profile sub-tabs (About | Experience | Availability)
          Matches NannyProfileBK tab layout exactly
         ═══════════════════════════════════════════════════════════════════ */}
      {profileExpanded && p && (
        <>
          {/* Sub-tab bar */}
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {PROFILE_TABS.map((tab) => {
              const isActive = profileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setProfileTab(tab.id)}
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

          {/* ── About sub-tab ── */}
          {profileTab === "about" && (
            <div className="space-y-3">
              {/* Bio card */}
              {(bio || p.strengths_traits) && (
                <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <Link
                    href="/nanny/profile"
                    className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:text-violet-600 hover:bg-slate-50 transition-colors"
                    title="Edit Profile"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    <h3 className="text-sm font-semibold text-slate-900">About {firstName}</h3>
                  </div>
                  <div
                    className="text-sm text-slate-600 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0"
                    dangerouslySetInnerHTML={{ __html: bio || p.strengths_traits || "" }}
                  />
                </div>
              )}

              {/* Strengths card — violet accent */}
              {strengths && strengths !== bio && (
                <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="h-4 w-4 text-violet-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Strengths</h3>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{strengths}</p>
                </div>
              )}

              {/* Preferences card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Preferences</h3>
                <div className="grid grid-cols-2 gap-2">
                  <GlanceItem icon={Baby} label={`Ages ${ageMonthsToLabel(p.min_child_age_months)} – ${ageMonthsToLabel(p.max_child_age_months)}`} />
                  {p.max_children && <GlanceItem icon={Users} label={`Up to ${p.max_children} children`} />}
                </div>
              </div>

            </div>
          )}

          {/* ── Experience sub-tab ── */}
          {profileTab === "experience" && (
            <div className="space-y-3">
              {/* Experience summary + stats */}
              <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Link
                  href="/nanny/profile"
                  className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:text-violet-600 hover:bg-slate-50 transition-colors"
                  title="Edit Profile"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Experience</h3>
                {experienceText && (
                  <div
                    className="text-sm text-slate-600 leading-relaxed mb-4 [&_p]:mb-2 [&_p:last-child]:mb-0"
                    dangerouslySetInnerHTML={{ __html: experienceText }}
                  />
                )}
                {!experienceText && (p.total_experience_years || p.nanny_experience_years) && (
                  <div className="space-y-1 text-sm text-slate-600 mb-4">
                    {p.total_experience_years != null && <p>{p.total_experience_years} years total childcare experience</p>}
                    {p.nanny_experience_years != null && <p>{p.nanny_experience_years} years as a nanny</p>}
                  </div>
                )}

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-xl font-bold text-violet-600">{p.total_experience_years ?? "–"}</p>
                    <p className="text-xs text-slate-500">Years Childcare</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center">
                    <p className="text-xl font-bold text-violet-600">{p.nanny_experience_years ?? "–"}</p>
                    <p className="text-xs text-slate-500">Years as Nanny</p>
                  </div>
                </div>
              </div>

              {/* At a Glance */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">At a Glance</h3>
                <div className="grid grid-cols-2 gap-2">
                  {p.drivers_license && <GlanceItem icon={Car} label="Driver's License" />}
                  {p.has_car && <GlanceItem icon={Car} label="Car" />}
                  {p.comfortable_with_pets && <GlanceItem icon={PawPrint} label="Pet Friendly" />}
                  {p.vaccination_status && <GlanceItem icon={Stethoscope} label="Fully Vaccinated" />}
                  {p.non_smoker && <GlanceItem icon={CigaretteOff} label="Non-Smoker" />}
                  {p.nationality && <GlanceItem icon={Globe} label={p.nationality} />}
                </div>
              </div>

            </div>
          )}

          {/* ── Availability sub-tab ── */}
          {profileTab === "availability" && (
            <div className="space-y-3">
              <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Link
                  href="/nanny/profile"
                  className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:text-violet-600 hover:bg-slate-50 transition-colors"
                  title="Edit Profile"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Weekly Availability</h3>
                </div>
                {p.availability?.schedule && Object.keys(p.availability.schedule).length > 0 ? (
                  <AvailabilityGrid schedule={p.availability.schedule} firstName={firstName} />
                ) : (
                  <p className="text-sm text-slate-400 italic">Availability not set yet.</p>
                )}
              </div>

            </div>
          )}
        </>
      )}

      {profileExpanded && !p && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center">
          <p className="text-sm text-slate-500">Complete your profile to see it here.</p>
          <Link
            href="/nanny/profile"
            className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-violet-600 hover:text-violet-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Set up profile
          </Link>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN TAB BAR — dynamic based on verification level
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(isTabsLocked
          ? [
              { id: "verification" as MainTabId, label: "Verification", locked: false },
              { id: "nannying" as MainTabId, label: "Nannying", locked: true },
              { id: "babysitting" as MainTabId, label: "Babysitting", locked: true },
            ]
          : [
              { id: "nannying" as MainTabId, label: "Nannying", locked: false },
              { id: "babysitting" as MainTabId, label: "Babysitting", locked: false },
            ]
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => tab.locked ? setShowTabLockedModal(true) : setActiveTab(tab.id)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                tab.locked
                  ? "opacity-50 cursor-not-allowed text-slate-400"
                  : isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
              )}
            >
              <span className="flex items-center justify-center gap-1.5">
                {tab.label}
                {tab.locked && <Lock className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "verification" && isTabsLocked && (
        <VerificationSummaryTile verificationData={verificationData} />
      )}
      {activeTab === "nannying" && (
        <NannyPositionsClient placements={placements} upcomingIntros={upcomingIntros} dfyNotificationsInitial={dfyNotifications} shareUnlocked={shareUnlocked} cardsLocked={isCardsLocked} onLockedCardClick={() => setShowCardLockedModal(true)} />
      )}
      {activeTab === "babysitting" && (
        <NannyBabysittingClient jobs={babysittingJobs} banned={bsrBanned} banUntil={bsrBanUntil} hideHeader shareUnlocked={shareUnlocked} cardsLocked={isCardsLocked} onLockedCardClick={() => setShowCardLockedModal(true)} />
      )}

      {/* Tab-locked modal */}
      <Dialog open={showTabLockedModal} onOpenChange={setShowTabLockedModal}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
              <Lock className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Verify your account</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                Complete verification to access your nannying and babysitting dashboard.
              </p>
            </div>
            <div className="flex w-full gap-2 mt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowTabLockedModal(false)}>
                Later
              </Button>
              <Button asChild className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <Link href="/nanny/verification">
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  Verify Now
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Card-locked modal (WWCC/OCG pending) */}
      <Dialog open={showCardLockedModal} onOpenChange={setShowCardLockedModal}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
              <ShieldCheck className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Verification in progress</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                Although you have passed your automatic verification, we are yet to receive confirmation of your WWCC from The Office of the Children&apos;s Guardian (OCG). Once your WWCC is given the all clear we will be able to connect you with families. Check back soon! Thank you for your patience.
              </p>
            </div>
            <Button className="w-full" onClick={() => setShowCardLockedModal(false)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Verification Summary Tile (for hub verification tab) ──────────────────────

type VerificationStepState = "completed" | "current" | "action_required" | "future";

function VerificationSummaryTile({ verificationData }: { verificationData: VerificationData | null }) {
  const identityStatus = verificationData?.identity_status ?? "not_started";
  const wwccStatus = verificationData?.wwcc_status ?? "not_started";
  const contactStatus = verificationData?.contact_status ?? "not_started";

  function deriveIdentityStep(): VerificationStepState {
    if (identityStatus === "verified") return "completed";
    if (identityStatus === "rejected" || identityStatus === "failed") return "action_required";
    if (identityStatus === "not_started") return "current";
    return "current"; // processing, pending, review
  }

  function deriveWwccStep(): VerificationStepState {
    if (wwccStatus === "verified" || wwccStatus === "doc_verified") return "completed";
    if (wwccStatus === "rejected" || wwccStatus === "failed" || wwccStatus === "barred") return "action_required";
    if (wwccStatus === "not_started") return identityStatus === "verified" ? "current" : "future";
    return "current"; // processing, pending, review, etc.
  }

  function deriveContactStep(): VerificationStepState {
    if (contactStatus === "saved") return "completed";
    if (contactStatus === "not_started") {
      return (wwccStatus !== "not_started" && identityStatus !== "not_started") ? "current" : "future";
    }
    return "current";
  }

  const identityStep = deriveIdentityStep();
  const wwccStep = deriveWwccStep();
  const contactStep = deriveContactStep();
  const allComplete = identityStep === "completed" && wwccStep === "completed" && contactStep === "completed";
  const goalStep: VerificationStepState = allComplete ? "completed" : "future";

  function stepStatusText(step: VerificationStepState, statusCode: string): string {
    if (step === "completed") return "Completed";
    if (step === "action_required") return "Action Required";
    if (step === "future") return "Upcoming";
    if (statusCode === "processing" || statusCode === "pending") return "Processing";
    if (statusCode === "review") return "Pending Review";
    if (statusCode === "not_started") return "Not Started";
    return "In Progress";
  }

  function stepColor(step: VerificationStepState): { circle: string; text: string } {
    switch (step) {
      case "completed": return { circle: "border-green-500 bg-green-500", text: "text-green-600" };
      case "current": return { circle: "border-violet-500 bg-violet-50", text: "text-violet-600" };
      case "action_required": return { circle: "border-red-500 bg-red-50", text: "text-red-600" };
      case "future": return { circle: "border-slate-200 bg-white", text: "text-slate-400" };
    }
  }

  const steps = [
    { label: "Verify ID", step: identityStep, status: identityStatus },
    { label: "Verify WWCC", step: wwccStep, status: wwccStatus },
    { label: "Verify Contact", step: contactStep, status: contactStatus },
    { label: "Connect with Families", step: goalStep, status: "" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-violet-600" />
        <p className="text-base font-semibold text-slate-800">Verification Progress</p>
      </div>

      <div className="space-y-0">
        {steps.map((s, i) => {
          const colors = stepColor(s.step);
          const isLast = i === steps.length - 1;
          return (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                  colors.circle
                )}>
                  {s.step === "completed" && <Check className="h-4 w-4 text-white" />}
                  {s.step === "current" && <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />}
                  {s.step === "action_required" && <div className="h-2.5 w-2.5 rounded-full bg-red-500" />}
                </div>
                {!isLast && (
                  <div className={cn("w-0.5 h-6", s.step === "completed" ? "bg-green-300" : "bg-slate-200")} />
                )}
              </div>
              <div className="pb-4">
                <p className={cn("text-sm font-medium", s.step === "future" ? "text-slate-400" : "text-slate-800")}>
                  {s.label}
                </p>
                {!isLast && (
                  <p className={cn("text-xs", colors.text)}>
                    {stepStatusText(s.step, s.status)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href="/nanny/verification"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-white font-medium text-sm transition-colors"
      >
        Continue Verification
      </Link>
    </div>
  );
}
