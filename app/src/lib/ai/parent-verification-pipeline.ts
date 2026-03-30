import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { getUserEmailInfo } from '@/lib/email/helpers';
import { createInboxMessage } from '@/lib/actions/connection-helpers';
import {
  PARENT_IDENTITY_STATUS,
  PARENT_VERIFICATION_STATUS,
  PARENT_VERIFICATION_LEVEL,
  PARENT_GUIDANCE_MESSAGES,
  type UserGuidance,
} from '@/lib/verification';
import { verifyPassport, type PassportVerificationResult } from './verify-passport';
import { verifyDriversLicense, type DriversLicenseVerificationResult } from './verify-drivers-license';
import { capitalizeName } from '@/lib/utils';

type VerificationResult = PassportVerificationResult | DriversLicenseVerificationResult;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

const AI_ATTEMPT_TIMEOUT = 25_000;
const RETRY_DELAY = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setParentIdentityReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  verificationId: string,
  issues: string[],
  guidance: UserGuidance | null
) {
  await supabase.from('parent_verifications').update({
    identity_status: PARENT_IDENTITY_STATUS.REVIEW,
    identity_status_at: new Date().toISOString(),
    identity_ai_issues: JSON.stringify(issues),
    identity_user_guidance: guidance,
    verification_status: PARENT_VERIFICATION_STATUS.PENDING_ID_REVIEW,
    updated_at: new Date().toISOString(),
  }).eq('id', verificationId);
}

// ============================================================================
// PARENT IDENTITY PHASE
// ============================================================================

export async function runParentIdentityPhase(verificationId: string): Promise<void> {
  console.log('[ParentIdentity] Starting phase for verification:', verificationId);

  const supabase = createAdminClient();

  // ---------------------------------------------------------------------------
  // 1. ATOMIC CLAIM
  // ---------------------------------------------------------------------------
  const { data: claimed, error: claimError } = await supabase
    .from('parent_verifications')
    .update({
      identity_status: PARENT_IDENTITY_STATUS.PROCESSING,
      identity_status_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', verificationId)
    .eq('identity_status', PARENT_IDENTITY_STATUS.PENDING)
    .select('id, user_id, surname, given_names, date_of_birth, issuing_country, document_type, document_upload_url, identification_photo_url')
    .single();

  if (claimError || !claimed) {
    console.log('[ParentIdentity] Already claimed or not found:', claimError?.message);
    return;
  }

  console.log('[ParentIdentity] Claimed verification:', claimed.id, 'for user:', claimed.user_id);

  // ---------------------------------------------------------------------------
  // 2. VALIDATE FILES
  // ---------------------------------------------------------------------------
  if (!claimed.document_upload_url || !claimed.identification_photo_url) {
    console.warn('[ParentIdentity] Missing files, setting to review');
    await setParentIdentityReview(
      supabase,
      verificationId,
      ['Missing document or identification photo'],
      PARENT_GUIDANCE_MESSAGES.INVALID_DOCUMENT
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. GENERATE SIGNED URLs
  // ---------------------------------------------------------------------------
  // Storage paths are stored as relative paths (e.g. "userId/1234-doc.jpg")
  const docPath = claimed.document_upload_url;
  const selfiePath = claimed.identification_photo_url;

  const [docUrlResult, selfieUrlResult] = await Promise.all([
    supabase.storage.from('parent-verifications').createSignedUrl(docPath, 3600),
    supabase.storage.from('parent-verifications').createSignedUrl(selfiePath, 3600),
  ]);

  if (docUrlResult.error || selfieUrlResult.error || !docUrlResult.data?.signedUrl || !selfieUrlResult.data?.signedUrl) {
    console.error('[ParentIdentity] Signed URL generation failed:', docUrlResult.error?.message, selfieUrlResult.error?.message);
    // Set to failed (not review) so the user can resubmit
    await supabase.from('parent_verifications').update({
      identity_status: PARENT_IDENTITY_STATUS.FAILED,
      identity_status_at: new Date().toISOString(),
      identity_ai_issues: JSON.stringify(['Could not access uploaded documents']),
      identity_user_guidance: PARENT_GUIDANCE_MESSAGES.TECHNICAL_RETRY,
      verification_status: PARENT_VERIFICATION_STATUS.ID_FAILED_AI,
      updated_at: new Date().toISOString(),
    }).eq('id', verificationId);
    return;
  }

  const docSignedUrl = docUrlResult.data.signedUrl;
  const selfieSignedUrl = selfieUrlResult.data.signedUrl;
  console.log('[ParentIdentity] Generated signed URLs successfully');

  // ---------------------------------------------------------------------------
  // 4. BUILD SUBMITTED DATA
  // ---------------------------------------------------------------------------
  const submittedData = {
    surname: claimed.surname,
    given_names: claimed.given_names,
    date_of_birth: claimed.date_of_birth,
    ...(claimed.document_type === 'passport'
      ? { passport_country: claimed.issuing_country }
      : { issuing_country: claimed.issuing_country }
    ),
  };

  console.log('[ParentIdentity] Submitted data:', submittedData);

  // ---------------------------------------------------------------------------
  // 5. 2-ATTEMPT RETRY LOOP
  // ---------------------------------------------------------------------------
  let result: VerificationResult | null = null;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[ParentIdentity] Attempt ${attempt}/2 for document type:`, claimed.document_type);

      let verifyPromise: Promise<VerificationResult>;

      if (claimed.document_type === 'passport') {
        verifyPromise = verifyPassport(
          docSignedUrl,
          selfieSignedUrl,
          {
            surname: claimed.surname,
            given_names: claimed.given_names,
            date_of_birth: claimed.date_of_birth,
            passport_country: claimed.issuing_country,
          }
        );
      } else if (claimed.document_type === 'drivers_license') {
        verifyPromise = verifyDriversLicense(
          docSignedUrl,
          selfieSignedUrl,
          {
            surname: claimed.surname,
            given_names: claimed.given_names,
            date_of_birth: claimed.date_of_birth,
            issuing_country: claimed.issuing_country,
          }
        );
      } else {
        throw new Error(`Unsupported document type: ${claimed.document_type}`);
      }

      result = await withTimeout(
        verifyPromise,
        AI_ATTEMPT_TIMEOUT,
        `Parent ${claimed.document_type} verification attempt ${attempt}`
      );

      console.log(`[ParentIdentity] Attempt ${attempt} completed successfully`);
      break; // Success, exit retry loop

    } catch (err) {
      lastError = err as Error;
      console.error(`[ParentIdentity] Attempt ${attempt} failed:`, lastError.message);

      if (attempt === 1) {
        // First attempt failed, store intermediate message and retry
        await supabase.from('parent_verifications').update({
          identity_ai_issues: JSON.stringify(['Taking a little longer than expected...']),
          updated_at: new Date().toISOString(),
        }).eq('id', verificationId);

        console.log(`[ParentIdentity] Waiting ${RETRY_DELAY / 1000}s before retry...`);
        await delay(RETRY_DELAY);
      } else {
        // Both attempts failed, reset to pending
        console.error('[ParentIdentity] Both attempts failed, resetting to pending');
        await supabase.from('parent_verifications').update({
          identity_status: PARENT_IDENTITY_STATUS.PENDING,
          identity_status_at: new Date().toISOString(),
          identity_user_guidance: PARENT_GUIDANCE_MESSAGES.TECHNICAL_RETRY,
          updated_at: new Date().toISOString(),
        }).eq('id', verificationId);
        return;
      }
    }
  }

  if (!result) {
    console.error('[ParentIdentity] No result after retry loop');
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. STORE EXTRACTION RESULTS
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractionUpdate: Record<string, any> = {
    identity_ai_reasoning: result.reasoning || 'No reasoning provided',
    identity_ai_issues: JSON.stringify(result.issues || []),
    selfie_confidence: result.selfie_confidence || null,
    updated_at: new Date().toISOString(),
  };

  if (claimed.document_type === 'passport') {
    const passportResult = result as PassportVerificationResult;
    extractionUpdate.extracted_surname = capitalizeName(passportResult.extracted?.surname) || null;
    extractionUpdate.extracted_given_names = capitalizeName(passportResult.extracted?.given_names) || null;
    extractionUpdate.extracted_dob = passportResult.extracted?.dob || null;
    extractionUpdate.extracted_nationality = passportResult.extracted?.nationality || null;
    extractionUpdate.extracted_passport_number = passportResult.extracted?.passport_number || null;
    extractionUpdate.extracted_passport_expiry = passportResult.extracted?.expiry || null;
  } else if (claimed.document_type === 'drivers_license') {
    const licenseResult = result as DriversLicenseVerificationResult;
    extractionUpdate.extracted_surname = capitalizeName(licenseResult.extracted?.surname) || null;
    extractionUpdate.extracted_given_names = capitalizeName(licenseResult.extracted?.given_names) || null;
    extractionUpdate.extracted_dob = licenseResult.extracted?.dob || null;
    extractionUpdate.extracted_license_number = licenseResult.extracted?.license_number || null;
    extractionUpdate.extracted_license_expiry = licenseResult.extracted?.license_expiry || null;
    extractionUpdate.extracted_license_state = licenseResult.extracted?.state_province || null;
    extractionUpdate.extracted_license_class = licenseResult.extracted?.license_class || null;
  }

  await supabase.from('parent_verifications').update(extractionUpdate).eq('id', verificationId);

  console.log('[ParentIdentity] Stored extraction results');

  // ---------------------------------------------------------------------------
  // 7. AI FAIL (result.pass is FALSE)
  // ---------------------------------------------------------------------------
  if (!result.pass) {
    console.log('[ParentIdentity] AI verification FAILED');

    const guidance = result.user_guidance || PARENT_GUIDANCE_MESSAGES.INVALID_DOCUMENT;

    await supabase.from('parent_verifications').update({
      identity_status: PARENT_IDENTITY_STATUS.FAILED,
      identity_status_at: new Date().toISOString(),
      verification_status: PARENT_VERIFICATION_STATUS.ID_FAILED_AI,
      identity_user_guidance: guidance,
      updated_at: new Date().toISOString(),
    }).eq('id', verificationId);

    // Send PVER-002 email (delayed 20 min)
    setTimeout(async () => {
      const userInfo = await getUserEmailInfo(claimed.user_id);
      if (userInfo) {
        sendEmail({
          to: userInfo.email,
          subject: 'Your ID verification needs attention',
          emailType: 'parent_verification_failed',
          html: `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #FF6B9D; margin-bottom: 24px;">ID Verification Needs Attention</h1>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
                Hi ${userInfo.firstName || 'there'},
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
                We've reviewed your ID verification submission and it needs some attention.
              </p>
              ${guidance ? `
                <div style="background: #FFF4F8; border-left: 4px solid #FF6B9D; padding: 16px; margin: 24px 0;">
                  <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0;">
                    <strong>What to do:</strong><br>
                    ${guidance.title || 'Please review and resubmit'}
                  </p>
                  ${guidance.explanation ? `
                    <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 8px 0 0;">
                      ${guidance.explanation}
                    </p>
                  ` : ''}
                </div>
              ` : ''}
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/parent/verification"
                 style="display: inline-block; background: #FF6B9D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 16px; font-weight: 500;">
                Update Verification
              </a>
              <p style="color: #666; font-size: 14px; margin-top: 24px;">
                Thanks,<br>
                The Baby Bloom Team
              </p>
            </div>
          `,
        }).catch(err => console.error('[ParentIdentity] PVER-002 email error:', err));
      }
    }, 20 * 60 * 1000);

    // Send PVINB-002 inbox (immediate)
    await createInboxMessage({
      userId: claimed.user_id,
      type: 'parent_verification',
      title: 'ID verification needs attention',
      body: guidance?.explanation || 'Your identity verification needs to be reviewed. Please check your verification page for details.',
      actionUrl: '/parent/verification',
    }).catch(err => console.error('[ParentIdentity] PVINB-002 inbox error:', err));

    console.log('[ParentIdentity] Failed status set, notifications sent');
    return;
  }

  // ---------------------------------------------------------------------------
  // 8. AI SUCCESS (result.pass is TRUE)
  // ---------------------------------------------------------------------------
  console.log('[ParentIdentity] AI verification PASSED');

  await supabase.from('parent_verifications').update({
    identity_status: PARENT_IDENTITY_STATUS.VERIFIED,
    identity_verified: true,
    identity_verified_at: new Date().toISOString(),
    identity_status_at: new Date().toISOString(),
    verification_status: PARENT_VERIFICATION_STATUS.VERIFIED,
    cross_check_status: 'passed',
    cross_check_at: new Date().toISOString(),
    identity_user_guidance: null,
    updated_at: new Date().toISOString(),
  }).eq('id', verificationId);

  // Update parents table verification level
  await supabase.from('parents').update({
    verification_level: PARENT_VERIFICATION_LEVEL.VERIFIED,
  }).eq('user_id', claimed.user_id);

  console.log('[ParentIdentity] Verification complete, updated parent record');

  // Send PVER-004 email (immediate)
  const userInfo = await getUserEmailInfo(claimed.user_id);
  if (userInfo) {
    sendEmail({
      to: userInfo.email,
      subject: "You're verified on Baby Bloom!",
      emailType: 'parent_verification_approved',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #FF6B9D; margin-bottom: 24px;">You're Verified!</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
            Hi ${userInfo.firstName || 'there'},
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
            Great news! Your identity has been verified on Baby Bloom.
          </p>
          <p style="color: #333; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            You can now connect with nannies, post babysitting requests, and start finding trusted care for your little ones.
          </p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/parent/browse"
             style="display: inline-block; background: #FF6B9D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">
            Browse Nannies
          </a>
          <p style="color: #666; font-size: 14px; margin-top: 32px;">
            Welcome to Baby Bloom!<br>
            The Baby Bloom Team
          </p>
        </div>
      `,
    }).catch(err => console.error('[ParentIdentity] PVER-004 email error:', err));
  }

  // Send PVINB-004 inbox (immediate)
  await createInboxMessage({
    userId: claimed.user_id,
    type: 'parent_verification',
    title: "You're verified!",
    body: 'Your identity has been verified. You can now connect with nannies and post babysitting requests.',
    actionUrl: '/parent/browse',
  }).catch(err => console.error('[ParentIdentity] PVINB-004 inbox error:', err));

  console.log('[ParentIdentity] Success! Notifications sent, verification complete');
}
