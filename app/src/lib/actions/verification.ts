'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  IDENTITY_STATUS,
  WWCC_STATUS,
  CONTACT_STATUS,
  CROSS_CHECK_STATUS,
  VERIFICATION_LEVEL,
  deriveOverallStatus,
  type IdentityStatus,
  type WwccStatus,
  type CrossCheckStatus,
  type UserGuidance,
} from '@/lib/verification';
import { triggerCrossCheck } from '@/lib/ai/verification-pipeline';
import { sendEmail } from '@/lib/email/resend';
import { getUserEmailInfo } from '@/lib/email/helpers';

// ── Shared auth helper ──

async function getAuthUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// ── Submit Identity Section ──

interface SubmitIdentityData {
  surname: string;
  given_names: string;
  date_of_birth: string;
  passport_country: string;
  passport_upload_url: string;
  identification_photo_url: string;
}

export async function submitIdentitySection(
  data: SubmitIdentityData
): Promise<{ success: boolean; error: string | null; verificationId?: string }> {
  console.log('[submitIdentitySection] Starting...');
  const user = await getAuthUser();
  if (!user) {
    console.error('[submitIdentitySection] Not authenticated');
    return { success: false, error: 'Not authenticated' };
  }
  console.log('[submitIdentitySection] Auth OK, user:', user.id);

  if (!data.surname?.trim() || !data.given_names?.trim() || !data.date_of_birth || !data.passport_country) {
    return { success: false, error: 'Missing required identity fields' };
  }
  if (!data.passport_upload_url || !data.identification_photo_url) {
    return { success: false, error: 'Missing document uploads' };
  }

  const admin = createAdminClient();

  // Check for existing record
  const { data: existing, error: existingErr } = await admin
    .from('verifications')
    .select('id')
    .eq('user_id', user.id)
    .single();
  console.log('[submitIdentitySection] Existing check:', existing ? 'found' : 'not found', existingErr?.code);

  const identityFields = {
    user_id: user.id,
    surname: data.surname.trim(),
    given_names: data.given_names.trim(),
    date_of_birth: data.date_of_birth,
    passport_country: data.passport_country,
    passport_upload_url: data.passport_upload_url,
    identification_photo_url: data.identification_photo_url,
    // Status
    identity_status: IDENTITY_STATUS.PENDING,
    identity_status_at: new Date().toISOString(),
    identity_verified: false,
    // Clear old AI data
    extracted_surname: null,
    extracted_given_names: null,
    extracted_dob: null,
    extracted_nationality: null,
    extracted_passport_number: null,
    extracted_passport_expiry: null,
    identity_ai_reasoning: null,
    identity_ai_issues: null,
    identity_rejection_reason: null,
    identity_user_guidance: null,
    // Reset cross-check (must re-run after identity resubmission)
    cross_check_status: CROSS_CHECK_STATUS.NOT_STARTED,
    cross_check_reasoning: null,
    cross_check_issues: null,
    cross_check_at: null,
    updated_at: new Date().toISOString(),
  };

  let verificationId: string;

  if (existing) {
    console.log('[submitIdentitySection] Updating existing record:', existing.id);
    const { error: updateErr } = await admin
      .from('verifications')
      .update(identityFields)
      .eq('id', existing.id);

    if (updateErr) {
      console.error('[submitIdentitySection] Update failed:', updateErr);
      return { success: false, error: `Failed to save identity data: ${updateErr.message}` };
    }
    verificationId = existing.id;
  } else {
    console.log('[submitIdentitySection] Inserting new record');
    const insertPayload = {
      ...identityFields,
      // Defaults for new record
      wwcc_status: WWCC_STATUS.NOT_STARTED,
      contact_status: CONTACT_STATUS.NOT_STARTED,
      verification_status: deriveOverallStatus(
        IDENTITY_STATUS.PENDING as IdentityStatus,
        WWCC_STATUS.NOT_STARTED as WwccStatus,
        CROSS_CHECK_STATUS.NOT_STARTED as CrossCheckStatus
      ),
    };
    console.log('[submitIdentitySection] Insert payload keys:', Object.keys(insertPayload).join(', '));

    const { data: inserted, error: insertErr } = await admin
      .from('verifications')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr || !inserted) {
      console.error('[submitIdentitySection] Insert failed:', insertErr);
      return { success: false, error: `Failed to create verification record: ${insertErr?.message ?? 'unknown'}` };
    }
    verificationId = inserted.id;
    console.log('[submitIdentitySection] Inserted:', verificationId);
  }

  // Update nannies table: level → 1
  const { error: nannyErr } = await admin.from('nannies').update({
    verification_level: VERIFICATION_LEVEL.REGISTERED,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);
  if (nannyErr) {
    console.error('[submitIdentitySection] Nanny update failed:', nannyErr);
  }

  console.log('[submitIdentitySection] Done, verificationId:', verificationId);
  revalidatePath('/nanny/verification');
  return { success: true, error: null, verificationId };
}

// ── Submit Identity for Manual Review ──

export async function submitIdentityForManualReview(): Promise<{ success: boolean; error: string | null }> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('verifications')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    return { success: false, error: 'No verification record found' };
  }

  // Set identity to review + wipe all WWCC data so user must re-submit after approval
  const { error: updateErr } = await admin
    .from('verifications')
    .update({
      identity_status: IDENTITY_STATUS.REVIEW,
      identity_status_at: new Date().toISOString(),
      identity_user_guidance: null,
      // Wipe WWCC data — user must re-submit after manual ID approval
      wwcc_status: WWCC_STATUS.NOT_STARTED,
      wwcc_status_at: null,
      wwcc_verification_method: null,
      wwcc_number: null,
      wwcc_expiry_date: null,
      wwcc_grant_email_url: null,
      wwcc_service_nsw_screenshot_url: null,
      wwcc_doc_verified: false,
      wwcc_doc_verified_at: null,
      wwcc_verified: false,
      wwcc_ai_reasoning: null,
      wwcc_ai_issues: null,
      wwcc_rejection_reason: null,
      wwcc_user_guidance: null,
      extracted_wwcc_surname: null,
      extracted_wwcc_first_name: null,
      extracted_wwcc_other_names: null,
      extracted_wwcc_number: null,
      extracted_wwcc_clearance_type: null,
      extracted_wwcc_expiry: null,
      // Reset cross-check
      cross_check_status: CROSS_CHECK_STATUS.NOT_STARTED,
      cross_check_reasoning: null,
      cross_check_issues: null,
      cross_check_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (updateErr) {
    console.error('[submitIdentityForManualReview] Update failed:', updateErr);
    return { success: false, error: 'Failed to submit for manual review' };
  }

  // VER-004: Submitted for Manual Review email
  const userInfo = await getUserEmailInfo(user.id);
  if (userInfo) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app-babybloom.vercel.app';
    sendEmail({
      to: userInfo.email,
      subject: "We're reviewing your documents",
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#f8fafc;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;"><span style="color:#0f172a;">Baby</span><span style="color:#8b5cf6;">Bloom</span></span>
    </div>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 16px;">We've received your documents</h1>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 12px;">Hi ${userInfo.firstName}, your identity documents have been submitted for manual review by our team.</p>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 12px;">We'll review everything and get back to you within <strong>24–48 hours</strong>. No further action is needed from you right now.</p>
    <p style="font-size:15px;color:#475569;line-height:1.6;margin:0 0 12px;">You can check the status of your verification at any time from your dashboard.</p>
    <div style="text-align:center;margin-top:24px;">
      <a href="${appUrl}/nanny/verification" style="display:inline-block;background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View Status</a>
    </div>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:0;">
        Baby Bloom Sydney<br/>
        <a href="https://babybloomsydney.com.au/legal/privacy-policy" style="color:#7c3aed;">Privacy Policy</a> |
        <a href="https://babybloomsydney.com.au/legal/professional-terms" style="color:#7c3aed;">Terms</a>
      </p>
    </div>
  </div>
</div>
</body></html>`,
      emailType: 'verification_pending',
      recipientUserId: user.id,
    }).catch(err => console.error('[ManualReview] VER-004 email error:', err));
  }

  revalidatePath('/nanny/verification');
  return { success: true, error: null };
}

// ── Submit WWCC Section ──

interface SubmitWWCCData {
  wwcc_verification_method: string;
  wwcc_number?: string;
  wwcc_expiry_date?: string;
  wwcc_grant_email_url?: string;
  wwcc_service_nsw_screenshot_url?: string;
  // Extracted fields from PDF parser (for grant_email)
  extracted_wwcc_surname?: string;
  extracted_wwcc_first_name?: string;
  extracted_wwcc_other_names?: string;
  extracted_wwcc_number?: string;
  extracted_wwcc_clearance_type?: string;
  extracted_wwcc_expiry?: string;
}

export async function submitWWCCSection(
  data: SubmitWWCCData
): Promise<{ success: boolean; error: string | null; verificationId?: string }> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!data.wwcc_verification_method) {
    return { success: false, error: 'Missing WWCC verification method' };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('verifications')
    .select('id, identity_status')
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    return { success: false, error: 'No verification record found. Please complete Identity section first.' };
  }

  // Determine status based on method
  let wwccStatus: string;
  if (data.wwcc_verification_method === 'grant_email') {
    wwccStatus = WWCC_STATUS.DOC_VERIFIED; // PDF already validated client-side
  } else if (data.wwcc_verification_method === 'service_nsw_app') {
    wwccStatus = WWCC_STATUS.PENDING; // Needs AI
  } else {
    wwccStatus = WWCC_STATUS.REVIEW; // Manual entry → admin reviews
  }

  const wwccFields = {
    wwcc_verification_method: data.wwcc_verification_method,
    wwcc_number: data.wwcc_number?.trim() ?? data.extracted_wwcc_number?.trim() ?? null,
    wwcc_expiry_date: data.wwcc_expiry_date ?? data.extracted_wwcc_expiry ?? null,
    wwcc_grant_email_url: data.wwcc_grant_email_url ?? null,
    wwcc_service_nsw_screenshot_url: data.wwcc_service_nsw_screenshot_url ?? null,
    // Extracted data (from PDF parser for grant_email)
    extracted_wwcc_surname: data.extracted_wwcc_surname ?? null,
    extracted_wwcc_first_name: data.extracted_wwcc_first_name ?? null,
    extracted_wwcc_other_names: data.extracted_wwcc_other_names ?? null,
    extracted_wwcc_number: data.extracted_wwcc_number ?? null,
    extracted_wwcc_clearance_type: data.extracted_wwcc_clearance_type ?? null,
    extracted_wwcc_expiry: data.extracted_wwcc_expiry ?? null,
    // Status
    wwcc_status: wwccStatus,
    wwcc_status_at: new Date().toISOString(),
    wwcc_verified: false,
    wwcc_doc_verified: wwccStatus === WWCC_STATUS.DOC_VERIFIED,
    wwcc_doc_verified_at: wwccStatus === WWCC_STATUS.DOC_VERIFIED ? new Date().toISOString() : null,
    // Clear old AI data
    wwcc_ai_reasoning: null,
    wwcc_ai_issues: null,
    wwcc_rejection_reason: null,
    wwcc_user_guidance: null,
    // Reset cross-check (must re-run after WWCC resubmission)
    cross_check_status: CROSS_CHECK_STATUS.NOT_STARTED,
    cross_check_reasoning: null,
    cross_check_issues: null,
    cross_check_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error: updateErr } = await admin
    .from('verifications')
    .update(wwccFields)
    .eq('id', existing.id);

  if (updateErr) {
    console.error('[submitWWCCSection] Update failed:', updateErr);
    return { success: false, error: 'Failed to save WWCC data' };
  }

  // For grant_email: always attempt cross-check (fire-and-forget).
  // triggerCrossCheck re-reads DB state, so it handles the race where
  // identity is still processing when WWCC is submitted.
  if (wwccStatus === WWCC_STATUS.DOC_VERIFIED) {
    triggerCrossCheck(existing.id).catch(err => {
      console.error('[submitWWCCSection] Cross-check error:', err);
    });
  }

  revalidatePath('/nanny/verification');
  return { success: true, error: null, verificationId: existing.id };
}

// ── Submit Contact Section ──

interface SubmitContactData {
  phone_number: string;
  address_line: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
}

export async function submitContactSection(
  data: SubmitContactData
): Promise<{ success: boolean; error: string | null }> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  if (!data.phone_number?.trim() || !data.address_line?.trim() || !data.city?.trim() || !data.postcode?.trim()) {
    return { success: false, error: 'Missing required contact details' };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('verifications')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!existing) {
    return { success: false, error: 'No verification record found. Please complete Identity section first.' };
  }

  const { error: updateErr } = await admin
    .from('verifications')
    .update({
      phone_number: data.phone_number.trim(),
      address_line: data.address_line.trim(),
      city: data.city.trim(),
      state: data.state?.trim() ?? null,
      postcode: data.postcode.trim(),
      country: data.country.trim(),
      contact_status: CONTACT_STATUS.SAVED,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (updateErr) {
    console.error('[submitContactSection] Update failed:', updateErr);
    return { success: false, error: 'Failed to save contact details' };
  }

  revalidatePath('/nanny/verification');
  return { success: true, error: null };
}

// ── Get Full Verification Data (for page load pre-population) ──

export interface VerificationData {
  id: string;
  // Per-section statuses
  identity_status: string;
  wwcc_status: string;
  contact_status: string;
  cross_check_status: string;
  // Legacy
  verification_status: number;
  // Identity fields
  surname: string | null;
  given_names: string | null;
  date_of_birth: string | null;
  passport_country: string | null;
  passport_upload_url: string | null;
  identification_photo_url: string | null;
  identity_verified: boolean;
  identity_rejection_reason: string | null;
  identity_user_guidance: UserGuidance | null;
  extracted_passport_number: string | null;
  extracted_nationality: string | null;
  // WWCC fields
  wwcc_verification_method: string | null;
  wwcc_number: string | null;
  wwcc_expiry_date: string | null;
  wwcc_grant_email_url: string | null;
  wwcc_service_nsw_screenshot_url: string | null;
  wwcc_doc_verified: boolean;
  wwcc_verified: boolean;
  wwcc_rejection_reason: string | null;
  wwcc_user_guidance: UserGuidance | null;
  // Contact fields
  phone_number: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  // Cross-check
  cross_check_reasoning: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export async function getVerificationData(): Promise<{
  data: VerificationData | null;
  error: string | null;
}> {
  const user = await getAuthUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('verifications')
    .select(`
      id,
      identity_status, wwcc_status, contact_status, cross_check_status,
      verification_status,
      surname, given_names, date_of_birth, passport_country,
      passport_upload_url, identification_photo_url,
      identity_verified, identity_rejection_reason, identity_user_guidance,
      extracted_passport_number, extracted_nationality,
      wwcc_verification_method, wwcc_number, wwcc_expiry_date,
      wwcc_grant_email_url, wwcc_service_nsw_screenshot_url,
      wwcc_doc_verified, wwcc_verified, wwcc_rejection_reason, wwcc_user_guidance,
      phone_number, address_line, city, state, postcode, country,
      cross_check_reasoning,
      created_at, updated_at
    `)
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[getVerificationData] Error:', error);
    return { data: null, error: 'Failed to fetch verification data' };
  }

  return { data: (data as VerificationData) ?? null, error: null };
}
