// T-032 — Drawer detail fetcher. Pulls the full nanny-360 for one user.

import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadContact, LeadNote, NannyContactState } from "./types";

export interface LeadDetail {
  nanny_user_id: string;
  nanny_id: string | null;
  user_profile: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    mobile_number: string | null;
    suburb: string | null;
    postcode: string | null;
    address_line1: string | null;
    address_line2: string | null;
    state: string | null;
    profile_picture_url: string | null;
    date_of_birth: string | null;
  } | null;
  nanny: {
    id: string;
    user_id: string;
    created_at: string;
    status: string | null;
    verification_level: number | null;
    abn: string | null;
    abn_updated_at: string | null;
    abn_push_flagged_at: string | null;
    bonus_program_completed_at: string | null;
    bonus_program_dismissed_at: string | null;
    payouts_enabled: boolean | null;
    charges_enabled: boolean | null;
    payout_application_status: string | null;
    deactivated_at: string | null;
    babysitter_eligible: boolean | null;
  } | null;
  verifications: {
    identity_verified: boolean | null;
    identity_verified_at: string | null;
    wwcc_verified: boolean | null;
    wwcc_verified_at: string | null;
    wwcc_expiry_date: string | null;
    verification_status: number | null;
    ocg_result_status: string | null;
    ocg_recorded_at: string | null;
  } | null;
  contact_state: NannyContactState | null;
  contacts: LeadContact[];
  notes: LeadNote | null;
  nanny_lead: Record<string, unknown> | null;
  children_linked: Array<{
    id: string;
    child_client_id: string;
    status: string;
    bonus_program: boolean;
    family_trial_started_at: string | null;
    created_at: string;
  }>;
  placements: Array<{
    id: string;
    parent_id: string;
    source: string | null;
    status: string;
    hired_at: string | null;
    ended_at: string | null;
    end_reason: string | null;
  }>;
  interview_requests: Array<{
    id: string;
    parent_id: string;
    position_id: string | null;
    status: string;
    responded_at: string | null;
    interview_date: string | null;
    outcome: string | null;
    created_at: string;
  }>;
  babysitting_notifications: Array<{
    id: string;
    babysitting_request_id: string;
    notified_at: string;
    accepted_at: string | null;
    declined_at: string | null;
    distance_km: number | null;
  }>;
  last_sign_in_at: string | null;
}

export async function fetchLeadDetail(
  nannyUserId: string,
): Promise<LeadDetail | null> {
  const supa = createAdminClient();

  const [
    profileRes,
    nannyRes,
    verificationsRes,
    contactStateRes,
    contactsRes,
    notesRes,
    nannyLeadRes,
    childrenRes,
    placementsRes,
    interviewsRes,
    bsrRes,
    authRes,
  ] = await Promise.all([
    supa
      .from("user_profiles")
      .select(
        "first_name, last_name, email, mobile_number, suburb, postcode, address_line1, address_line2, state, profile_picture_url, date_of_birth",
      )
      .eq("user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("nannies")
      .select(
        "id, user_id, created_at, status, verification_level, abn, abn_updated_at, abn_push_flagged_at, bonus_program_completed_at, bonus_program_dismissed_at, payouts_enabled, charges_enabled, payout_application_status, deactivated_at, babysitter_eligible",
      )
      .eq("user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("verifications")
      .select(
        "identity_verified, identity_verified_at, wwcc_verified, wwcc_verified_at, wwcc_expiry_date, verification_status, ocg_result_status, ocg_recorded_at",
      )
      .eq("user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("nanny_contact_state")
      .select("*")
      .eq("nanny_user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("lead_contacts")
      .select("*")
      .eq("nanny_user_id", nannyUserId)
      .order("contacted_at", { ascending: false })
      .limit(100),
    supa
      .from("lead_notes")
      .select("*")
      .eq("nanny_user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("nanny_leads")
      .select("*")
      .eq("auth_user_id", nannyUserId)
      .maybeSingle(),
    supa
      .from("child_invites")
      .select(
        "id, child_client_id, status, bonus_program, family_trial_started_at, created_at",
      )
      .eq("nanny_user_id", nannyUserId)
      .order("created_at", { ascending: false }),
    nannyOnlyPlacements(supa, nannyUserId),
    nannyOnlyInterviews(supa, nannyUserId),
    nannyOnlyBabysitting(supa, nannyUserId),
    supa.auth.admin.getUserById(nannyUserId),
  ]);

  // Sanity: if no nanny record + no profile, nanny doesn't exist or not a nanny.
  if (!profileRes.data && !nannyRes.data) return null;

  return {
    nanny_user_id: nannyUserId,
    nanny_id: nannyRes.data?.id ?? null,
    user_profile: profileRes.data ?? null,
    nanny: nannyRes.data ?? null,
    verifications: verificationsRes.data ?? null,
    contact_state: (contactStateRes.data ?? null) as NannyContactState | null,
    contacts: (contactsRes.data ?? []) as LeadContact[],
    notes: (notesRes.data ?? null) as LeadNote | null,
    nanny_lead: (nannyLeadRes.data ?? null) as Record<string, unknown> | null,
    children_linked: childrenRes.data ?? [],
    placements: placementsRes,
    interview_requests: interviewsRes,
    babysitting_notifications: bsrRes,
    last_sign_in_at: authRes.data?.user?.last_sign_in_at ?? null,
  };
}

async function nannyOnlyPlacements(
  supa: ReturnType<typeof createAdminClient>,
  nannyUserId: string,
): Promise<LeadDetail["placements"]> {
  // nanny_placements joins on nanny_id (the nannies.id), not user_id.
  // Two-step: fetch nanny row to get id, then placements.
  const { data: n } = await supa
    .from("nannies")
    .select("id")
    .eq("user_id", nannyUserId)
    .maybeSingle<{ id: string }>();
  if (!n) return [];
  const { data } = await supa
    .from("nanny_placements")
    .select("id, parent_id, source, status, hired_at, ended_at, end_reason")
    .eq("nanny_id", n.id)
    .order("hired_at", { ascending: false, nullsFirst: false });
  return data ?? [];
}

async function nannyOnlyInterviews(
  supa: ReturnType<typeof createAdminClient>,
  nannyUserId: string,
): Promise<LeadDetail["interview_requests"]> {
  const { data: n } = await supa
    .from("nannies")
    .select("id")
    .eq("user_id", nannyUserId)
    .maybeSingle<{ id: string }>();
  if (!n) return [];
  const { data } = await supa
    .from("interview_requests")
    .select(
      "id, parent_id, position_id, status, responded_at, interview_date, outcome, created_at",
    )
    .eq("nanny_id", n.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

async function nannyOnlyBabysitting(
  supa: ReturnType<typeof createAdminClient>,
  nannyUserId: string,
): Promise<LeadDetail["babysitting_notifications"]> {
  const { data: n } = await supa
    .from("nannies")
    .select("id")
    .eq("user_id", nannyUserId)
    .maybeSingle<{ id: string }>();
  if (!n) return [];
  const { data } = await supa
    .from("bsr_notifications")
    .select(
      "id, babysitting_request_id, notified_at, accepted_at, declined_at, distance_km",
    )
    .eq("nanny_id", n.id)
    .order("notified_at", { ascending: false })
    .limit(30);
  return data ?? [];
}
