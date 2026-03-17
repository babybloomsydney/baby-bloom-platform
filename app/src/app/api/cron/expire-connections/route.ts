import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInboxMessage, logConnectionEvent } from '@/lib/actions/connection-helpers';
import { sendEmail } from '@/lib/email/resend';
import { getUserEmailInfo } from '@/lib/email/helpers';
import { CONNECTION_STAGE } from '@/lib/position/constants';

/**
 * Cron endpoint: expires pending connection requests past their expires_at.
 * Sends INT-005 (parent) and INT-006 (nanny) emails.
 *
 * Called by Vercel Cron every 15 minutes (see vercel.json).
 * Also callable manually: GET /api/cron/expire-connections
 *
 * Note: lazy expiry in getNannyConnectionRequests/getParentConnectionRequests
 * is the primary mechanism. This cron is the safety net for email notifications.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app-babybloom.vercel.app';
  const baseStyle = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;`;
  const btnStyle = `background: #8B5CF6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;`;

  // Find all pending/accepted requests past expiry
  const { data: stale } = await supabase
    .from('connection_requests')
    .select('id, parent_id, nanny_id, status')
    .in('status', ['pending', 'accepted'])
    .lt('expires_at', now);

  let expired = 0;

  for (const req of stale ?? []) {
    const wasAccepted = req.status === 'accepted';

    // Update to expired — set both status and connection_stage
    const { error } = await supabase
      .from('connection_requests')
      .update({
        status: 'expired',
        connection_stage: req.status === 'pending'
          ? CONNECTION_STAGE.REQUEST_EXPIRED
          : CONNECTION_STAGE.SCHEDULE_EXPIRED,
        updated_at: now,
      })
      .eq('id', req.id)
      .in('status', ['pending', 'accepted']); // Optimistic lock

    if (error) continue; // Already expired by lazy expiry

    expired++;

    // Log event
    await logConnectionEvent({
      connectionRequestId: req.id,
      parentId: req.parent_id,
      nannyId: req.nanny_id,
      eventType: 'expired',
    });

    // Get user IDs
    const { data: nannyData } = await supabase
      .from('nannies')
      .select('user_id')
      .eq('id', req.nanny_id)
      .single();

    const { data: parentData } = await supabase
      .from('parents')
      .select('user_id')
      .eq('id', req.parent_id)
      .single();

    // Parent inbox + email (INT-005)
    if (parentData) {
      await createInboxMessage({
        userId: parentData.user_id,
        type: 'connection_expired',
        title: 'Connection request expired',
        body: wasAccepted
          ? 'Your accepted connection has expired because a meet and greet was not scheduled in time.'
          : 'Your connection request has expired as the nanny did not respond in time.',
        actionUrl: '/parent/connections',
        referenceId: req.id,
        referenceType: 'connection_request',
      });

      const parentInfo = await getUserEmailInfo(parentData.user_id);
      if (parentInfo) {
        sendEmail({
          to: parentInfo.email,
          subject: 'Connection request expired',
          html: `<div style="${baseStyle}">
            <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] INT-005 — Connection Expired (to parent). Your connection request has expired as the nanny did not respond in time. You can browse other nannies and send new requests.</p>
            <p style="margin-top: 24px;"><a href="${appUrl}/parent/browse" style="${btnStyle}">Browse Nannies</a></p>
          </div>`,
          emailType: 'interview_request',
          recipientUserId: parentData.user_id,
        }).catch(err => console.error('[ExpireCron] INT-005 email error:', err));
      }
    }

    // Nanny inbox + email (INT-006)
    if (nannyData) {
      await createInboxMessage({
        userId: nannyData.user_id,
        type: 'connection_expired',
        title: wasAccepted ? 'Accepted connection expired' : 'Missed connection request',
        body: wasAccepted
          ? 'An accepted connection has expired because the family did not schedule a meet and greet in time.'
          : 'A connection request has expired. Responding promptly helps families find the right nanny.',
        actionUrl: '/nanny/inbox',
        referenceId: req.id,
        referenceType: 'connection_request',
      });

      const nannyInfo = await getUserEmailInfo(nannyData.user_id);
      if (nannyInfo) {
        sendEmail({
          to: nannyInfo.email,
          subject: 'Missed connection request',
          html: `<div style="${baseStyle}">
            <h1 style="color: #8B5CF6; font-size: 24px; margin-bottom: 16px;">Baby Bloom Sydney</h1>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">[TBD] INT-006 — Connection Expired (to nanny). A family's connection request has expired. Responding promptly helps families find the right nanny. Check your inbox regularly for new requests.</p>
            <p style="margin-top: 24px;"><a href="${appUrl}/nanny/inbox" style="${btnStyle}">View Inbox</a></p>
          </div>`,
          emailType: 'interview_request',
          recipientUserId: nannyData.user_id,
        }).catch(err => console.error('[ExpireCron] INT-006 email error:', err));
      }
    }
  }

  console.log(`[ExpireConnections] Expired: ${expired}`);
  return NextResponse.json({ expired });
}
