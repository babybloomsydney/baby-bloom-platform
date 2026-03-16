import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNannyPlacements, getNannyUpcomingIntros } from '@/lib/actions/position-funnel';
import { getNannyBabysittingJobs } from '@/lib/actions/babysitting';
import { getDfyNotificationsForNanny } from '@/lib/actions/matching';
import { getVerificationData } from '@/lib/actions/verification';
import { NannyHubClient, type NannyProfileAccordionData } from './NannyHubClient';

export default async function NannyHubPage() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const admin = createAdminClient();

  // Phase 1: profile + nanny record (needed for nannyId + accordion data)
  const [profileRes, nannyRes] = await Promise.all([
    admin.from('user_profiles').select('first_name, last_name, profile_picture_url, suburb, date_of_birth').eq('user_id', user.id).single(),
    admin.from('nannies').select('id, verification_level, visible_in_bsr, ai_content, nationality, total_experience_years, nanny_experience_years, under_3_experience_years, newborn_experience_years, role_types_preferred, level_of_support_offered, hourly_rate_min, max_children, min_child_age_months, max_child_age_months, drivers_license, has_car, comfortable_with_pets, vaccination_status, non_smoker, languages, hobbies_interests, strengths_traits, skills_training, verification_tier').eq('user_id', user.id).single(),
  ]);

  const nannyId = nannyRes.data?.id;

  // Phase 2: all data for both tabs + accordion availability
  const [placementsRes, introsRes, bsrRes, dfyRes, verificationRes, availRes, credsRes] = await Promise.all([
    getNannyPlacements(),
    getNannyUpcomingIntros(),
    getNannyBabysittingJobs(),
    getDfyNotificationsForNanny(),
    getVerificationData(),
    nannyId
      ? admin.from('nanny_availability').select('days_available, schedule').eq('nanny_id', nannyId).maybeSingle()
      : Promise.resolve({ data: null }),
    nannyId
      ? admin.from('nanny_credentials').select('credential_category, qualification_type, certification_type').eq('nanny_id', nannyId)
      : Promise.resolve({ data: null }),
  ]);

  const shareUnlocked = nannyRes.data?.visible_in_bsr === true;

  // Assemble accordion profile data
  const n = nannyRes.data;
  const nannyProfile: NannyProfileAccordionData | null = n ? {
    suburb: profileRes.data?.suburb || '',
    date_of_birth: profileRes.data?.date_of_birth || null,
    nationality: n.nationality,
    total_experience_years: n.total_experience_years,
    nanny_experience_years: n.nanny_experience_years,
    under_3_experience_years: n.under_3_experience_years,
    newborn_experience_years: n.newborn_experience_years,
    role_types_preferred: n.role_types_preferred,
    level_of_support_offered: n.level_of_support_offered,
    hourly_rate_min: n.hourly_rate_min,
    max_children: n.max_children,
    min_child_age_months: n.min_child_age_months,
    max_child_age_months: n.max_child_age_months,
    drivers_license: n.drivers_license,
    has_car: n.has_car,
    comfortable_with_pets: n.comfortable_with_pets,
    vaccination_status: n.vaccination_status,
    non_smoker: n.non_smoker,
    languages: n.languages,
    hobbies_interests: n.hobbies_interests,
    strengths_traits: n.strengths_traits,
    skills_training: n.skills_training,
    ai_content: n.ai_content as Record<string, unknown> | null,
    availability: availRes.data ? {
      days_available: availRes.data.days_available,
      schedule: availRes.data.schedule as Record<string, string[]> | null,
    } : null,
    highest_qualification: (credsRes.data || []).find((c: { credential_category: string }) => c.credential_category === 'qualification')?.qualification_type || null,
    certificates: (credsRes.data || []).filter((c: { credential_category: string }) => c.credential_category === 'certification').map((c: { certification_type: string }) => c.certification_type).filter(Boolean) as string[],
  } : null;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <NannyHubClient
        firstName={profileRes.data?.first_name || 'there'}
        lastName={profileRes.data?.last_name || ''}
        profilePictureUrl={profileRes.data?.profile_picture_url || null}
        verificationLevel={nannyRes.data?.verification_level ?? 0}
        verificationData={verificationRes.data}
        nannyProfile={nannyProfile}
        placements={placementsRes.data || []}
        upcomingIntros={introsRes.data || []}
        dfyNotifications={dfyRes.data || []}
        babysittingJobs={bsrRes.data || []}
        bsrBanned={bsrRes.banned || false}
        bsrBanUntil={bsrRes.banUntil || null}
        shareUnlocked={shareUnlocked}
      />
    </div>
  );
}
