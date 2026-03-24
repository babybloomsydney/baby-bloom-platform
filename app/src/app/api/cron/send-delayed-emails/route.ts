import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { getUserEmailInfo } from '@/lib/email/helpers';
import { createInboxMessage } from '@/lib/actions/connection-helpers';

/**
 * Cron endpoint: checks for verification failures older than 10 minutes
 * where the user has NOT taken any further action (updated_at unchanged).
 * Sends VER-002 (identity failed) and VER-003 (WWCC failed) emails.
 *
 * Called by Vercel Cron every 5 minutes (see vercel.json).
 * Also callable manually: GET /api/cron/send-delayed-emails
 */
export async function GET(request: NextRequest) {
  // Optional: protect with a cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app-babybloom.vercel.app';
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;`;
  const btnStyle = `background: #8B5CF6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;`;

  let sent = 0;
  let skipped = 0;

  // ── VER-002: Identity failed, no action in 10 minutes ──
  const { data: identityFailed } = await supabase
    .from('verifications')
    .select('id, user_id, identity_status_at, updated_at')
    .eq('identity_status', 'failed')
    .lt('identity_status_at', tenMinutesAgo);

  for (const v of identityFailed ?? []) {
    // Check no action taken: updated_at should equal identity_status_at (within 2s tolerance)
    const statusAt = new Date(v.identity_status_at).getTime();
    const updatedAt = new Date(v.updated_at).getTime();
    if (Math.abs(updatedAt - statusAt) > 2000) {
      // User has taken action since the failure — skip
      skipped++;
      continue;
    }

    // Check we haven't already sent this email (deduplicate)
    const { count } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', v.user_id)
      .eq('email_type', 'verification_rejected')
      .gte('created_at', v.identity_status_at);

    if (count && count > 0) {
      skipped++;
      continue;
    }

    const userInfo = await getUserEmailInfo(v.user_id);
    if (!userInfo) continue;

    await sendEmail({
      to: userInfo.email,
      subject: 'Action needed: Your identity verification',
      html: `<div style="${baseStyle}">
        <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] VER-002 — Identity Verification Failed (delayed 10min). ID check needs attention. No failure details in email — directs to website for guidance and resubmission.</p>
        <p style="margin-top: 24px;"><a href="${appUrl}/nanny/verification" style="${btnStyle}">Fix It Now</a></p>
      </div>`,
      emailType: 'verification_rejected',
      recipientUserId: v.user_id,
    });
    sent++;
  }

  // ── VER-003: WWCC failed, no action in 10 minutes ──
  const { data: wwccFailed } = await supabase
    .from('verifications')
    .select('id, user_id, wwcc_status_at, updated_at')
    .eq('wwcc_status', 'failed')
    .lt('wwcc_status_at', tenMinutesAgo);

  for (const v of wwccFailed ?? []) {
    const statusAt = new Date(v.wwcc_status_at).getTime();
    const updatedAt = new Date(v.updated_at).getTime();
    if (Math.abs(updatedAt - statusAt) > 2000) {
      skipped++;
      continue;
    }

    const { count } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', v.user_id)
      .eq('email_type', 'verification_rejected')
      .gte('created_at', v.wwcc_status_at);

    if (count && count > 0) {
      skipped++;
      continue;
    }

    const userInfo = await getUserEmailInfo(v.user_id);
    if (!userInfo) continue;

    await sendEmail({
      to: userInfo.email,
      subject: 'Action needed: Your WWCC verification',
      html: `<div style="${baseStyle}">
        <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] VER-003 — WWCC Verification Failed (delayed 10min). WWCC check needs attention. No failure details in email — directs to website for guidance and resubmission.</p>
        <p style="margin-top: 24px;"><a href="${appUrl}/nanny/verification" style="${btnStyle}">Fix It Now</a></p>
      </div>`,
      emailType: 'verification_rejected',
      recipientUserId: v.user_id,
    });
    sent++;
  }

  // ── POST-008: Service follow-up — 48h after AWAITING_RESPONSE, nudge parent ──
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: awaitingConnections } = await supabase
    .from('connection_requests')
    .select('id, parent_id, nanny_id, intro_outcome_reported_at')
    .eq('connection_stage', 30) // AWAITING_RESPONSE
    .lt('intro_outcome_reported_at', fortyEightHoursAgo);

  for (const conn of awaitingConnections ?? []) {
    // Dedup: check if we already sent service_followup for this connection
    const { count: alreadySent } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('email_type', 'service_followup')
      .eq('subject', conn.id); // Store connection ID in subject field for dedup — or use metadata

    // Alternative dedup: check by recipient + email type + time window
    const { data: parentData } = await supabase
      .from('parents')
      .select('user_id')
      .eq('id', conn.parent_id)
      .single();

    if (!parentData) continue;

    const { count: dedupCount } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', parentData.user_id)
      .eq('email_type', 'service_followup')
      .gte('created_at', conn.intro_outcome_reported_at);

    if (dedupCount && dedupCount > 0) {
      skipped++;
      continue;
    }

    // Get nanny name for the email
    const { data: nannyData } = await supabase
      .from('nannies')
      .select('user_id')
      .eq('id', conn.nanny_id)
      .single();

    const parentInfo = await getUserEmailInfo(parentData.user_id);
    const nannyInfo = nannyData ? await getUserEmailInfo(nannyData.user_id) : null;
    if (!parentInfo) continue;

    const nannyName = nannyInfo ? `${nannyInfo.firstName}` : 'your nanny';

    await createInboxMessage({
      userId: parentData.user_id,
      type: 'service_followup',
      title: `How are things going with ${nannyName}?`,
      body: `It's been a couple of days since your meet and greet. Let us know if you'd like to proceed or if we can help you find another nanny.`,
      actionUrl: '/parent/connections',
      referenceId: conn.id,
      referenceType: 'connection_request',
    });

    await sendEmail({
      to: parentInfo.email,
      subject: `How are things going with ${nannyName}?`,
      html: `<div style="${baseStyle}">
        <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${parentInfo.firstName}, it's been a couple of days since your meet and greet with ${nannyName}. We'd love to know how things are going!</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">If you'd like to move forward, you can confirm the arrangement in your dashboard. If it wasn't the right fit, we're here to help you find another nanny.</p>
        <p style="margin-top: 24px;"><a href="${appUrl}/parent/connections" style="${btnStyle}">View Connection</a></p>
      </div>`,
      emailType: 'service_followup',
      recipientUserId: parentData.user_id,
    });
    sent++;
  }

  // ── POST-010: Stale connection follow-up — 7 days after INTRO_COMPLETE with no outcome ──
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleConnections } = await supabase
    .from('connection_requests')
    .select('id, parent_id, nanny_id, updated_at')
    .eq('connection_stage', 21) // INTRO_COMPLETE
    .is('intro_outcome_reported_at', null)
    .lt('updated_at', sevenDaysAgo);

  for (const conn of staleConnections ?? []) {
    const { data: nannyData } = await supabase
      .from('nannies')
      .select('user_id')
      .eq('id', conn.nanny_id)
      .single();

    if (!nannyData) continue;

    // Dedup
    const { count: dedupCount } = await supabase
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', nannyData.user_id)
      .eq('email_type', 'stale_connection_followup')
      .gte('created_at', conn.updated_at);

    if (dedupCount && dedupCount > 0) {
      skipped++;
      continue;
    }

    const { data: parentData } = await supabase
      .from('parents')
      .select('user_id')
      .eq('id', conn.parent_id)
      .single();

    const nannyInfo = await getUserEmailInfo(nannyData.user_id);
    const parentInfo = parentData ? await getUserEmailInfo(parentData.user_id) : null;
    if (!nannyInfo) continue;

    const parentName = parentInfo ? `${parentInfo.firstName}` : 'the family';

    await createInboxMessage({
      userId: nannyData.user_id,
      type: 'stale_connection_followup',
      title: `How did your meet and greet with ${parentName} go?`,
      body: `We haven't heard from you about your meet and greet. Let us know how it went so we can help with next steps.`,
      actionUrl: '/nanny/positions',
      referenceId: conn.id,
      referenceType: 'connection_request',
    });

    await sendEmail({
      to: nannyInfo.email,
      subject: `How did your meet and greet with ${parentName} go?`,
      html: `<div style="${baseStyle}">
        <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hi ${nannyInfo.firstName}, we haven't heard from you about your meet and greet with ${parentName}. When you have a moment, let us know how it went so we can help with next steps.</p>
        <p style="margin-top: 24px;"><a href="${appUrl}/nanny/positions" style="${btnStyle}">Update in My Positions</a></p>
      </div>`,
      emailType: 'stale_connection_followup',
      recipientUserId: nannyData.user_id,
    });
    sent++;
  }

  console.log(`[Delayed Emails] Sent: ${sent}, Skipped: ${skipped}`);
  return NextResponse.json({ sent, skipped });
}
