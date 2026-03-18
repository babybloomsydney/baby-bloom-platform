'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { signUp, type ActionResult } from '@/lib/auth/actions';
import { AGE_RANGE_TO_MONTHS, HOURS_TO_INT, buildScheduleJson } from '@/lib/actions/position-utils';
import { POSITION_STAGE, POSITION_STATUS } from '@/lib/position/constants';
import type { TypeformFormData } from '@/app/parent/request/questions';

/**
 * Sign up a new parent AND convert their lead into real position records.
 * Called from the post-onboarding signup page (/matchmaking/signup?lead=X).
 */
export async function signUpAndConvertLead(
  formData: FormData,
  leadId: string
): Promise<ActionResult> {
  // Step 1: Create the auth user + parent record via existing signUp
  const signUpResult = await signUp(formData);

  if (signUpResult.error || !signUpResult.success) {
    return signUpResult;
  }

  // Step 2: Convert the lead (best-effort — signup already succeeded)
  try {
    const adminClient = createAdminClient();

    // Fetch the lead's form data
    const { data: lead, error: leadError } = await adminClient
      .from('parent_leads')
      .select('form_data')
      .eq('id', leadId)
      .single();

    if (leadError || !lead?.form_data) {
      console.error('[lead-conversion] Lead fetch error:', leadError);
      return signUpResult; // Signup succeeded, conversion failed — still redirect
    }

    const fd = lead.form_data as Record<string, unknown>;

    // Look up the new user's ID from the email they just signed up with
    const email = formData.get('email') as string;
    const { data: userProfile } = await adminClient
      .from('user_profiles')
      .select('user_id')
      .eq('email', email)
      .single();

    if (!userProfile) {
      console.error('[lead-conversion] Could not find user profile for:', email);
      return signUpResult;
    }

    const userId = userProfile.user_id;

    // Look up the parent record
    const { data: parent } = await adminClient
      .from('parents')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!parent) {
      console.error('[lead-conversion] Could not find parent record for user:', userId);
      return signUpResult;
    }

    const parentId = parent.id;

    // Step 3: Create nanny_positions row (mirrors saveTypeformPosition field mapping)
    const positionRow = {
      parent_id: parentId,
      status: 'active',
      stage: POSITION_STAGE.OPEN,
      position_status: POSITION_STATUS.OPEN,

      minimum_age_requirement: fd.minimum_age ? parseInt(fd.minimum_age as string) : null,
      years_of_experience: fd.years_of_experience ? parseInt(fd.years_of_experience as string) : null,
      hours_per_week: fd.hours_per_week ? (HOURS_TO_INT[fd.hours_per_week as string] ?? null) : null,

      drivers_license_required: fd.drivers_license_required === 'Yes',
      car_required: fd.car_required === 'Yes',
      vaccination_required: false,
      non_smoker_required: false,
      comfortable_with_pets_required: false,

      language_preference: (fd.language_preference as string) ?? null,
      language_preference_details: (fd.language_preference_details as string) ?? null,
      suburb: (fd.suburb as string) ?? null,
      postcode: (fd.postcode as number) ?? null,
      schedule_type: (fd.schedule_type as string) ?? null,
      urgency: (fd.urgency as string) ?? null,
      start_date: (fd.start_date as string) ?? null,
      placement_length: (fd.placement_length as string) ?? null,

      days_required: (fd.weekly_roster as string[]) ?? [],
      reason_for_nanny: fd.reason_for_nanny ? [fd.reason_for_nanny as string] : [],

      details: {
        child_needs: fd.child_needs_yn === 'Yes',
        focus_type: (fd.focus_type as string) ?? null,
        support_type: (fd.support_type as string) ?? null,
        placement_duration: (fd.placement_duration as string) ?? null,
        hours_per_week_label: (fd.hours_per_week as string) ?? null,
        form_data: fd,
      },
    };

    const { data: position, error: posError } = await adminClient
      .from('nanny_positions')
      .insert(positionRow)
      .select('id')
      .single();

    if (posError) {
      console.error('[lead-conversion] Position create error:', posError);
      return signUpResult;
    }

    const positionId = position.id;

    // Step 4: Create position_children rows
    const numChildren = (fd.num_children as number) ?? 0;
    if (numChildren > 0) {
      const AGE_KEYS = ['child_a_age', 'child_b_age', 'child_c_age'] as const;
      const childrenRows = Array.from({ length: Math.min(numChildren, 3) })
        .map((_, i) => {
          const ageRange = (fd[AGE_KEYS[i]] as string) ?? '';
          return {
            position_id: positionId,
            child_label: ['A', 'B', 'C'][i],
            age_months: AGE_RANGE_TO_MONTHS[ageRange] ?? 0,
            display_order: i + 1,
          };
        })
        .filter((c) => c.age_months > 0);

      if (childrenRows.length > 0) {
        const { error: childErr } = await adminClient
          .from('position_children')
          .insert(childrenRows);
        if (childErr) console.error('[lead-conversion] Children error:', childErr);
      }
    }

    // Step 5: Create position_schedule
    const schedule = buildScheduleJson(fd as Partial<TypeformFormData>);
    if (Object.keys(schedule).length > 0) {
      const { error: schedErr } = await adminClient
        .from('position_schedule')
        .upsert(
          { position_id: positionId, schedule },
          { onConflict: 'position_id' }
        );
      if (schedErr) console.error('[lead-conversion] Schedule error:', schedErr);
    }

    // Step 6: Mark lead as converted
    await adminClient
      .from('parent_leads')
      .update({
        converted_at: new Date().toISOString(),
        converted_to_user_id: userId,
      })
      .eq('id', leadId);

  } catch (err) {
    console.error('[lead-conversion] Unexpected error:', err);
  }

  // Override redirect to browse page with matches tab active
  return { success: true, redirectTo: '/parent?t=childcare&s=nannies&v=matches' };
}
