import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase/admin';

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM = 'Baby Bloom <noreply@babybloomsydney.com.au>';

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  emailType: string;
  recipientUserId?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, text, replyTo, emailType, recipientUserId, attachments } = params;
  const recipientEmail = Array.isArray(to) ? to[0] : to;

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      await logEmail({
        recipientUserId,
        recipientEmail,
        emailType,
        subject,
        bodyHtml: html,
        bodyText: text,
        status: 'failed',
        errorMessage: error.message,
      });
      return { success: false, error: error.message };
    }

    const messageId = data?.id ?? undefined;

    await logEmail({
      recipientUserId,
      recipientEmail,
      emailType,
      subject,
      bodyHtml: html,
      bodyText: text,
      status: 'sent',
      providerMessageId: messageId,
    });

    console.log(`[Email] Sent ${emailType} to ${recipientEmail} (${messageId})`);
    return { success: true, messageId };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Email] Send exception:', message);

    await logEmail({
      recipientUserId,
      recipientEmail,
      emailType,
      subject,
      bodyHtml: html,
      bodyText: text,
      status: 'failed',
      errorMessage: message,
    }).catch(() => {}); // Don't let logging failure mask the real error

    return { success: false, error: message };
  }
}

// ── Batch send (for babysitting notifications etc.) ──

export interface BatchEmailItem {
  to: string;
  subject: string;
  html: string;
  text?: string;
  emailType: string;
  recipientUserId?: string;
}

export async function sendBatchEmails(emails: BatchEmailItem[]): Promise<{
  sent: number;
  failed: number;
}> {
  if (emails.length === 0) return { sent: 0, failed: 0 };

  // Use Resend Batch API — single request for up to 100 personalized emails
  const BATCH_LIMIT = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_LIMIT) {
    const chunk = emails.slice(i, i + BATCH_LIMIT);

    try {
      const payload = chunk.map(email => ({
        from: DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        ...(email.text ? { text: email.text } : {}),
      }));

      const { data, error } = await resend.batch.send(payload);

      if (error) {
        console.error('[Email] Batch API error:', error);
        failed += chunk.length;

        // Log all as failed
        await Promise.allSettled(
          chunk.map(email =>
            logEmail({
              recipientUserId: email.recipientUserId,
              recipientEmail: email.to,
              emailType: email.emailType,
              subject: email.subject,
              bodyHtml: email.html,
              bodyText: email.text,
              status: 'failed',
              errorMessage: error.message,
            })
          )
        );
        continue;
      }

      // Batch succeeded — log each email
      const ids = data?.data ?? [];
      sent += ids.length;
      // If batch returned fewer IDs than sent, remaining are failures
      if (ids.length < chunk.length) {
        failed += chunk.length - ids.length;
      }

      await Promise.allSettled(
        chunk.map((email, idx) =>
          logEmail({
            recipientUserId: email.recipientUserId,
            recipientEmail: email.to,
            emailType: email.emailType,
            subject: email.subject,
            bodyHtml: email.html,
            bodyText: email.text,
            status: idx < ids.length ? 'sent' : 'failed',
            providerMessageId: ids[idx]?.id,
          })
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown batch error';
      console.error('[Email] Batch send exception:', message);
      failed += chunk.length;

      await Promise.allSettled(
        chunk.map(email =>
          logEmail({
            recipientUserId: email.recipientUserId,
            recipientEmail: email.to,
            emailType: email.emailType,
            subject: email.subject,
            bodyHtml: email.html,
            bodyText: email.text,
            status: 'failed',
            errorMessage: message,
          })
        )
      );
    }
  }

  console.log(`[Email] Batch: ${sent} sent, ${failed} failed out of ${emails.length}`);
  return { sent, failed };
}

// ── Email logging ──

interface LogEmailParams {
  recipientUserId?: string;
  recipientEmail: string;
  emailType: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  status: 'sent' | 'failed';
  providerMessageId?: string;
  errorMessage?: string;
}

async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('email_logs').insert({
      recipient_user_id: params.recipientUserId ?? null,
      recipient_email: params.recipientEmail,
      email_type: params.emailType,
      subject: params.subject,
      body_html: params.bodyHtml ?? null,
      body_text: params.bodyText ?? null,
      status: params.status,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      failed_at: params.status === 'failed' ? new Date().toISOString() : null,
      error_message: params.errorMessage ?? null,
      provider_message_id: params.providerMessageId ?? null,
    });
  } catch (err) {
    console.error('[Email] Failed to log email:', err);
  }
}
