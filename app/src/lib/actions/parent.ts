'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { POSITION_STAGE, POSITION_STATUS, CONNECTION_STAGE } from '@/lib/position/constants';
import { funnelLog } from '@/lib/position/logger';
import { createInboxMessage } from './connection-helpers';

export interface Position {
  id: string;
  parent_id: string;
  title: string | null;
  description: string | null;

  // Timeline
  urgency: string | null;
  start_date: string | null;
  placement_length: string | null;
  end_date: string | null;

  // Schedule
  schedule_type: string | null;
  hours_per_week: number | null;
  days_required: string[] | null;
  schedule_details: string | null;

  // Nanny Requirements
  language_preference: string | null;
  language_preference_details: string | null;
  minimum_age_requirement: number | null;
  years_of_experience: number | null;
  qualification_requirement: string | null;
  certificate_requirements: string[] | null;
  assurances_required: string[] | null;
  residency_status_requirement: string | null;

  // Booleans
  vaccination_required: boolean | null;
  drivers_license_required: boolean | null;
  car_required: boolean | null;
  comfortable_with_pets_required: boolean | null;
  non_smoker_required: boolean | null;
  other_requirements_exist: boolean | null;
  other_requirements_details: string | null;

  // Compensation
  hourly_rate: number | null;
  pay_frequency: string[] | null;

  // Reason & Support
  reason_for_nanny: string[] | null;
  level_of_support: string[] | null;

  // Location
  suburb: string | null;
  postcode: number | null;

  // Details (JSONB)
  details: Record<string, unknown> | null;

  // Status
  status: string;
  created_at: string;
  updated_at: string;

  // Funnel (new — nullable until fully migrated)
  stage: number | null;
  position_status: number | null;
  activated_at: string | null;
  onboarding_complete_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  closed_at: string | null;
  filled_at: string | null;
  filled_by_nanny_id: string | null;
}

export interface PositionChild {
  id: string;
  position_id: string;
  child_label: string;
  age_months: number;
  gender: string | null;
  display_order: number;
}

export interface PositionWithChildren extends Position {
  children: PositionChild[];
}

export async function getParentId(): Promise<string | null> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: parent, error } = await supabase
    .from('parents')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (error || !parent) return null;
  return parent.id;
}

export async function getPosition(): Promise<{ data: PositionWithChildren | null; error: string | null }> {
  const supabase = createClient();

  const parentId = await getParentId();
  if (!parentId) {
    return { data: null, error: 'Not authenticated as parent' };
  }

  // Get position
  const { data: position, error: positionError } = await supabase
    .from('nanny_positions')
    .select('*')
    .eq('parent_id', parentId)
    .in('status', ['active', 'filled'])
    .single();

  if (positionError) {
    if (positionError.code === 'PGRST116') {
      // No rows found - that's OK
      return { data: null, error: null };
    }
    console.error('Position fetch error:', positionError);
    return { data: null, error: 'Failed to fetch position' };
  }

  // Get children for the position
  const { data: children, error: childrenError } = await supabase
    .from('position_children')
    .select('*')
    .eq('position_id', position.id)
    .order('display_order');

  if (childrenError) {
    console.error('Children fetch error:', childrenError);
  }

  return {
    data: {
      ...position,
      children: children || [],
    },
    error: null,
  };
}

export interface CreatePositionData {
  // Timeline
  urgency?: string;
  start_date?: string;
  placement_length?: string;
  end_date?: string;

  // Schedule
  schedule_type?: string;
  hours_per_week?: number;
  days_required?: string[];
  schedule_details?: string;

  // Children (1-3)
  children?: Array<{
    age_months: number;
    gender?: string;
  }>;

  // Nanny Requirements
  language_preference?: string;
  language_preference_details?: string;
  minimum_age_requirement?: number;
  years_of_experience?: number;
  qualification_requirement?: string;
  certificate_requirements?: string[];
  assurances_required?: string[];
  residency_status_requirement?: string;

  // Booleans
  vaccination_required?: boolean;
  drivers_license_required?: boolean;
  car_required?: boolean;
  comfortable_with_pets_required?: boolean;
  non_smoker_required?: boolean;
  other_requirements_exist?: boolean;
  other_requirements_details?: string;

  // Compensation
  hourly_rate?: number;
  pay_frequency?: string[];

  // Reason & Support
  reason_for_nanny?: string[];
  level_of_support?: string[];
}

export async function createPosition(
  data: CreatePositionData
): Promise<{ success: boolean; error: string | null; positionId?: string }> {
  const supabase = createClient();

  const parentId = await getParentId();
  if (!parentId) {
    return { success: false, error: 'Not authenticated as parent' };
  }

  // Extract children from data
  const { children, ...positionData } = data;

  // Create position
  const { data: position, error: positionError } = await supabase
    .from('nanny_positions')
    .insert({
      parent_id: parentId,
      ...positionData,
      status: 'active',
      stage: POSITION_STAGE.OPEN,
      position_status: POSITION_STATUS.OPEN,
    })
    .select('id')
    .single();

  if (positionError) {
    console.error('Position create error:', positionError);
    if (positionError.code === '23505') {
      return { success: false, error: 'You already have an active position. Please close it first.' };
    }
    return { success: false, error: 'Failed to create position' };
  }

  funnelLog('createPosition', position.id, '→ Open(1)', { parentId });

  // Create children records
  if (children && children.length > 0) {
    const childrenData = children.map((child, index) => ({
      position_id: position.id,
      child_label: ['A', 'B', 'C'][index],
      age_months: child.age_months,
      gender: child.gender || null,
      display_order: index + 1,
    }));

    const { error: childrenError } = await supabase
      .from('position_children')
      .insert(childrenData);

    if (childrenError) {
      console.error('Children create error:', childrenError);
      // Don't fail the whole operation, position was created
    }
  }

  revalidatePath('/parent');
  return { success: true, error: null, positionId: position.id };
}

export async function updatePosition(
  positionId: string,
  data: CreatePositionData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const parentId = await getParentId();
  if (!parentId) {
    return { success: false, error: 'Not authenticated as parent' };
  }

  // Extract children from data
  const { children, ...positionData } = data;

  // Update position
  const { error: positionError } = await supabase
    .from('nanny_positions')
    .update(positionData)
    .eq('id', positionId)
    .eq('parent_id', parentId);

  if (positionError) {
    console.error('Position update error:', positionError);
    return { success: false, error: 'Failed to update position' };
  }

  // Update children - delete existing and recreate
  if (children) {
    await supabase
      .from('position_children')
      .delete()
      .eq('position_id', positionId);

    if (children.length > 0) {
      const childrenData = children.map((child, index) => ({
        position_id: positionId,
        child_label: ['A', 'B', 'C'][index],
        age_months: child.age_months,
        gender: child.gender || null,
        display_order: index + 1,
      }));

      await supabase
        .from('position_children')
        .insert(childrenData);
    }
  }

  revalidatePath('/parent');
  return { success: true, error: null };
}

// ── Typeform position save ──

import type { TypeformFormData } from '@/app/parent/request/questions';

import { AGE_RANGE_TO_MONTHS, HOURS_TO_INT, buildScheduleJson } from './position-utils';

export async function saveTypeformPosition(
  formData: Partial<TypeformFormData>
): Promise<{ success: boolean; error: string | null; positionId?: string }> {
  const supabase = createClient();

  const parentId = await getParentId();
  if (!parentId) {
    return { success: false, error: 'Not authenticated as parent' };
  }

  // Check for existing active position
  const { data: existing } = await supabase
    .from('nanny_positions')
    .select('id')
    .eq('parent_id', parentId)
    .in('status', ['active', 'filled'])
    .maybeSingle();

  // Build position row
  const positionRow = {
    // Integers
    minimum_age_requirement: formData.minimum_age
      ? parseInt(formData.minimum_age)
      : null,
    years_of_experience: formData.years_of_experience
      ? parseInt(formData.years_of_experience)
      : null,
    hours_per_week: formData.hours_per_week
      ? (HOURS_TO_INT[formData.hours_per_week] ?? null)
      : null,

    // Booleans (form stores "Yes"/"No" strings)
    drivers_license_required: formData.drivers_license_required === 'Yes',
    car_required: formData.car_required === 'Yes',
    vaccination_required: false,
    non_smoker_required: false,
    comfortable_with_pets_required: false,

    // Text
    language_preference: formData.language_preference ?? null,
    language_preference_details: formData.language_preference_details ?? null,
    suburb: formData.suburb ?? null,
    postcode: formData.postcode ?? null,
    schedule_type: formData.schedule_type ?? null,
    urgency: formData.urgency ?? null,
    start_date: formData.start_date ?? null,
    placement_length: formData.placement_length ?? null,

    // Arrays
    days_required: formData.weekly_roster ?? [],
    reason_for_nanny: formData.reason_for_nanny
      ? [formData.reason_for_nanny]
      : [],

    // JSONB — descriptive fields not queried for matching + full form data for editing
    details: {
      has_pets_details: formData.has_pets_details ?? null,
      child_needs: formData.child_needs_yn === 'Yes',
      child_needs_details: formData.child_needs_details ?? null,
      dietary_restrictions: formData.dietary_restrictions_yn === 'Yes',
      dietary_restrictions_details: formData.dietary_restrictions_details ?? null,
      focus_type: formData.focus_type ?? null,
      support_type: formData.support_type ?? null,
      placement_duration: formData.placement_duration ?? null,
      hours_per_week_label: formData.hours_per_week ?? null,
      notes: formData.notes ?? null,
      form_data: formData,
    },
  };

  let positionId: string;

  if (existing) {
    const { error } = await supabase
      .from('nanny_positions')
      .update(positionRow)
      .eq('id', existing.id)
      .eq('parent_id', parentId);

    if (error) {
      console.error('Position update error:', error);
      return { success: false, error: 'Failed to update position' };
    }
    positionId = existing.id;
  } else {
    const { data: position, error } = await supabase
      .from('nanny_positions')
      .insert({
        parent_id: parentId,
        ...positionRow,
        status: 'active',
        stage: POSITION_STAGE.OPEN,
        position_status: POSITION_STATUS.OPEN,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Position create error:', error);
      if (error.code === '23505') {
        return {
          success: false,
          error: 'You already have an active position.',
        };
      }
      return { success: false, error: 'Failed to create position' };
    }
    positionId = position.id;
    funnelLog('saveTypeformPosition', positionId, '→ Open(1)', { parentId });
  }

  // Children: delete existing and recreate
  await supabase
    .from('position_children')
    .delete()
    .eq('position_id', positionId);

  const numChildren = formData.num_children ?? 0;
  if (numChildren > 0) {
    const AGE_KEYS = [
      'child_a_age',
      'child_b_age',
      'child_c_age',
    ] as const;
    const GENDER_KEYS = [
      'child_a_gender',
      'child_b_gender',
      'child_c_gender',
    ] as const;

    const childrenRows = Array.from({ length: numChildren }).map((_, i) => ({
      position_id: positionId,
      child_label: ['A', 'B', 'C'][i],
      age_months:
        AGE_RANGE_TO_MONTHS[
          (formData[AGE_KEYS[i] as keyof TypeformFormData] as string) ?? ''
        ] ?? 0,
      gender:
        (formData[GENDER_KEYS[i] as keyof TypeformFormData] as string) ?? null,
      display_order: i + 1,
    }));

    const { error: childrenError } = await supabase
      .from('position_children')
      .insert(childrenRows);

    if (childrenError) {
      console.error('Children create error:', childrenError);
    }
  }

  // Schedule: upsert
  const schedule = buildScheduleJson(formData);
  if (Object.keys(schedule).length > 0) {
    const { error: scheduleError } = await supabase
      .from('position_schedule')
      .upsert(
        { position_id: positionId, schedule },
        { onConflict: 'position_id' }
      );

    if (scheduleError) {
      console.error('Schedule upsert error:', scheduleError);
    }
  }

  revalidatePath('/parent');
  revalidatePath('/parent/request');

  // Notify nanny if active placement exists for this position
  if (existing) {
    const adminClient = createAdminClient();
    const { data: activePlacement } = await adminClient
      .from('nanny_placements')
      .select('nanny_id')
      .eq('position_id', positionId)
      .eq('status', 'active')
      .maybeSingle();

    if (activePlacement) {
      const { data: nanny } = await adminClient
        .from('nannies')
        .select('user_id')
        .eq('id', activePlacement.nanny_id)
        .single();

      if (nanny) {
        const { data: parentProfile } = await adminClient
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
          .single();

        const familyName = parentProfile ? `The ${parentProfile.last_name} family` : 'Your family';
        await createInboxMessage({
          userId: nanny.user_id,
          type: 'position_updated',
          title: `${familyName} has updated the position details`,
          body: 'The family has made changes to the position. Review the updates on your dashboard.',
          actionUrl: '/nanny/positions',
        });
      }
    }
  }

  return { success: true, error: null, positionId };
}

export async function closePosition(
  positionId: string,
  noCandidates?: boolean
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const parentId = await getParentId();
  if (!parentId) {
    return { success: false, error: 'Not authenticated as parent' };
  }

  const posStatus = noCandidates
    ? POSITION_STATUS.CLOSED_NO_CANDIDATES
    : POSITION_STATUS.CLOSED;

  const { error } = await supabase
    .from('nanny_positions')
    .update({
      status: 'cancelled',
      stage: POSITION_STAGE.CLOSED,
      position_status: posStatus,
      closed_at: new Date().toISOString(),
    })
    .eq('id', positionId)
    .eq('parent_id', parentId);

  if (error) {
    console.error('Position close error:', error);
    return { success: false, error: 'Failed to close position' };
  }

  // Cancel all active connections for this position
  const adminClient = createAdminClient();
  await adminClient
    .from('connection_requests')
    .update({
      status: 'cancelled',
      connection_stage: CONNECTION_STAGE.CANCELLED_BY_PARENT,
      updated_at: new Date().toISOString(),
    })
    .eq('position_id', positionId)
    .in('status', ['pending', 'accepted', 'confirmed']);

  funnelLog('closePosition', positionId, `→ Closed(${posStatus})`, { parentId, noCandidates });

  revalidatePath('/parent');
  revalidatePath('/parent/connections');
  return { success: true, error: null };
}

// ── Account Settings ──

export interface UpdateParentAccountData {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  mobile_number?: string | null;
  suburb?: string;
  postcode?: string;
}

export async function updateParentAccountSettings(
  data: UpdateParentAccountData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const profileFields: Record<string, unknown> = {};
  if (data.first_name !== undefined) profileFields.first_name = data.first_name;
  if (data.last_name !== undefined) profileFields.last_name = data.last_name;
  if (data.date_of_birth !== undefined) profileFields.date_of_birth = data.date_of_birth;
  if (data.mobile_number !== undefined) profileFields.mobile_number = data.mobile_number;
  if (data.suburb !== undefined) profileFields.suburb = data.suburb;
  if (data.postcode !== undefined) profileFields.postcode = data.postcode;

  if (Object.keys(profileFields).length > 0) {
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update(profileFields)
      .eq('user_id', user.id);

    if (profileError) {
      return { success: false, error: 'Failed to update account info' };
    }
  }

  revalidatePath('/parent/settings');
  return { success: true, error: null };
}

export async function deactivateParentAccount(): Promise<{ success: boolean; error: string | null }> {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get parent record
  const { data: parent } = await admin
    .from('parents')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (parent) {
    // Close any active positions
    await admin
      .from('nanny_positions')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('parent_id', parent.id)
      .in('status', ['draft', 'open', 'in_progress']);

    // Cancel any pending connection requests
    await admin
      .from('connection_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('parent_id', parent.id)
      .in('status', ['pending', 'accepted']);
  }

  await admin.from('activity_logs').insert({
    user_id: user.id,
    action: 'account_deactivated',
    details: { deactivated_by: 'user', role: 'parent' },
  });

  await supabase.auth.signOut();
  return { success: true, error: null };
}
