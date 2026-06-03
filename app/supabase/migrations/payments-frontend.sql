-- ============================================================================
-- Migration: Payments frontend — subscribe_invites + contact_messages
--            + parent_subscriptions cancellation/email-reminder columns
-- File: app/supabase/migrations/payments-frontend.sql
-- Pre-req: payments-foundation.sql applied (live since 2026-05-11)
-- Spec: system/APP/PAYMENTS/FRONTEND/03-build-spec.md
--       system/APP/PAYMENTS/FRONTEND/04-codebase-reality.md
-- Review: database-reviewer pass 2026-05-11T15:00+10:00 — all CRITICAL +
--         HIGH + MEDIUM-M2/M3/M4 fixes applied.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Extend activity_logs CHECK constraint with the action types needed by
--    Phase A–G of the frontend build.
-- ----------------------------------------------------------------------------
ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;

ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_action_type_check
  CHECK (action_type IN (
    -- Existing values (from supabase-setup.sql) — DO NOT REMOVE.
    'signup', 'login', 'profile_updated', 'profile_deactivated',
    'nanny_profile_created', 'nanny_verification_submitted', 'nanny_tier_upgraded',
    'nanny_availability_updated', 'wwcc_expired', 'wwcc_renewed',
    'parent_profile_created', 'position_created', 'position_updated', 'position_closed',
    'babysitting_request_created', 'babysitting_request_cancelled',
    'interview_requested', 'interview_accepted', 'interview_declined', 'interview_completed',
    'placement_created', 'placement_ended', 'placement_paused', 'placement_resumed',
    'admin_override', 'verification_approved', 'verification_rejected',
    'user_suspended', 'user_reinstated',
    'email_sent', 'notification_sent', 'file_deleted',
    -- Child-linking action types (folded in by payments-foundation).
    'child_deleted',
    'invite_created',
    'invite_connected',
    'invite_declined',
    'invite_revoked',
    'nanny_left_child',
    'nanny_removed_by_parent',
    'orphan_cleanup_run',
    'signup_via_invite',
    -- Payment events (from payments-foundation).
    'trial_started',
    'trial_lapsed',
    'subscription_started',
    'subscription_renewed',
    'subscription_past_due',
    'subscription_recovered',
    'subscription_cancelled',
    'subscription_lapsed',
    'subscription_converted_upfront_to_monthly',
    'trial_notification_sent',
    'conversion_notification_sent',
    'commission_scheduled',
    'commission_released',
    'commission_held',
    'commission_cancelled',
    'payout_send_failed',
    'payout_paid',
    'payout_failed',
    'payout_application_started',
    'payout_application_status_changed',
    'nanny_account_updated',
    'refund_requested',
    'refund_decision',
    'refund_processed',
    'refund_processing_failed',
    'refund_manually_completed',
    'duplicate_checkout_refunded',
    'test_user_flag_changed',
    'stripe_webhook_received',
    'stripe_webhook_processed',
    'stripe_reconciliation_drift',
    'cron_run',
    'kill_switch_blocked',
    'serr_report_generated',
    'serr_report_lodged',
    'payouts_held_due_to_no_abn',
    -- NEW for FRONTEND build:
    'subscribe_invite_created',          -- S5: nanny generated share-link
    'subscribe_invite_redeemed',         -- S5: parent paid via share-link
    'subscribe_invite_revoked',          -- S5: admin or cleanup invalidated
    'contact_message_received',          -- S14: anyone submitted a Contact Us form
    'contact_message_replied',           -- S14: admin replied via the dashboard
    'account_closure_completed'          -- S10: full cascade finished
  ));

-- ----------------------------------------------------------------------------
-- 1. subscribe_invites table — S5 nanny share-link mechanism.
--    Mirrors child_invites pattern (same XXXX-XXXX token format).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribe_invites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token               TEXT NOT NULL UNIQUE,
  child_client_id     UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
  nanny_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'redeemed', 'expired', 'revoked')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ
);

-- NOTE: no explicit index on token — the UNIQUE constraint above already
-- creates a unique B-tree index suitable for equality lookups.

CREATE INDEX IF NOT EXISTS idx_subscribe_invites_pending
  ON subscribe_invites(child_client_id, nanny_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_subscribe_invites_parent
  ON subscribe_invites(parent_user_id, status);

DROP TRIGGER IF EXISTS set_subscribe_invites_updated_at ON subscribe_invites;
CREATE TRIGGER set_subscribe_invites_updated_at
  BEFORE UPDATE ON subscribe_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE subscribe_invites IS
  'Nanny-initiated subscription invites. Generated from the SubscribeModal nanny variant — nanny shares a tokenised URL with the parent who then completes Checkout on a personalised /parent/subscribe?via=nanny-invite page.';

COMMENT ON COLUMN subscribe_invites.expires_at IS
  'Reserved for the post-launch 7-day discount window mechanic. Null at launch — discount mechanic captures created_at for future use without backfill.';

ALTER TABLE subscribe_invites ENABLE ROW LEVEL SECURITY;

-- Nanny reads own pending invites (to dedup share-link generation).
DROP POLICY IF EXISTS "nanny_reads_own_subscribe_invites" ON subscribe_invites;
CREATE POLICY "nanny_reads_own_subscribe_invites" ON subscribe_invites
  FOR SELECT
  USING (nanny_user_id = auth.uid());

-- Parent can read their own invite to render personalised header — server
-- typically resolves by token via admin client, but parents may legitimately
-- want to see the invite in their account.
DROP POLICY IF EXISTS "parent_reads_own_subscribe_invites" ON subscribe_invites;
CREATE POLICY "parent_reads_own_subscribe_invites" ON subscribe_invites
  FOR SELECT
  USING (parent_user_id = auth.uid());

-- INSERT/UPDATE/DELETE: server-only via admin client. No direct RLS write
-- policy — `createSubscribeInvite` server action enforces:
--   (a) auth user is the nanny on this child_client
--   (b) parent_user_id matches the child_client.parent_user_id
-- Doing this in app code (not RLS) prevents the H1 vulnerability of a
-- compromised nanny token writing arbitrary parent_user_id (database-reviewer
-- 2026-05-11). Admin client bypasses RLS so this is consistent with the
-- pattern already used by contact_messages below.

-- ----------------------------------------------------------------------------
-- 2. contact_messages table — S14 admin support inbox.
--    The existing email-only contact flow is preserved + augmented with
--    DB storage so admin dashboard has the messages to surface.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email                CITEXT NOT NULL,
  sender_name                 TEXT,
  subject                     TEXT NOT NULL,
  body                        TEXT NOT NULL,
  category                    TEXT NOT NULL DEFAULT 'general'
                              CHECK (category IN ('refund', 'billing', 'technical', 'general')),
  status                      TEXT NOT NULL DEFAULT 'unread'
                              CHECK (status IN ('unread', 'replied', 'closed', 'spam')),
  related_subscription_id     UUID REFERENCES parent_subscriptions(id) ON DELETE SET NULL,
  reply_subject               TEXT,
  reply_body                  TEXT,
  replied_at                  TIMESTAMPTZ,
  replied_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
  ON contact_messages(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_user
  ON contact_messages(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_messages_category
  ON contact_messages(category, created_at DESC);

-- Foreign-key column always indexed (database-reviewer M4).
CREATE INDEX IF NOT EXISTS idx_contact_messages_replied_by
  ON contact_messages(replied_by)
  WHERE replied_by IS NOT NULL;

DROP TRIGGER IF EXISTS set_contact_messages_updated_at ON contact_messages;
CREATE TRIGGER set_contact_messages_updated_at
  BEFORE UPDATE ON contact_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contact_messages IS
  'Persistent record of every Contact Us submission. Backs the admin support dashboard at /admin/support. The existing email-to-admin@babybloomsydney.com.au notification continues alongside this storage.';

COMMENT ON COLUMN contact_messages.user_id IS
  'NULL for anonymous public-site submissions. Set when the message came from an authenticated session. Anonymous submitters cannot read their messages back — there is no authenticated identity to assert ownership. Intentional.';

COMMENT ON COLUMN contact_messages.related_subscription_id IS
  'Optional link to the parent_subscriptions row this message concerns. Set by category-aware extraction during submission, or by the admin during review.';

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated user reads own messages (for "my support history" if we ever build it).
-- Anonymous (user_id NULL) cannot read back — auth.uid() returns NULL on anon
-- and NULL = NULL is false in SQL.
DROP POLICY IF EXISTS "user_reads_own_contact_messages" ON contact_messages;
CREATE POLICY "user_reads_own_contact_messages" ON contact_messages
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT policy: tightened per database-reviewer C2.
-- Anonymous submitters: auth.uid() IS NULL AND row's user_id MUST be NULL.
-- Authenticated submitters: row's user_id MUST equal auth.uid() (no self-detaching).
DROP POLICY IF EXISTS "user_inserts_own_contact_message" ON contact_messages;
CREATE POLICY "user_inserts_own_contact_message" ON contact_messages
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR user_id = auth.uid()
  );

-- Admin access via service-role admin client only. No direct RLS admin grant
-- on this table — keeps the surface narrow + consistent with the pattern.

-- ----------------------------------------------------------------------------
-- 3. parent_subscriptions schema additions
--    - trial_reminder_5d_sent_at: tracks the T-5 trial expiry email cron (S17)
--    - cancellation_reason_text: optional freeform expansion of cancel reason
--
--    Note: cancellation_reason TEXT column ALREADY EXISTS in
--    payments-foundation.sql:112. We only add the CHECK constraint here
--    (database-reviewer C1).
-- ----------------------------------------------------------------------------
ALTER TABLE parent_subscriptions
  ADD COLUMN IF NOT EXISTS trial_reminder_5d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason_text  TEXT;

-- Add the CHECK constraint on the existing cancellation_reason column.
-- Wrapped in DO block for idempotent re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parent_subscriptions_cancellation_reason_check'
  ) THEN
    ALTER TABLE parent_subscriptions
      ADD CONSTRAINT parent_subscriptions_cancellation_reason_check
      CHECK (
        cancellation_reason IS NULL
        OR cancellation_reason IN (
          'too_expensive',
          'not_using',
          'service_issue',
          'circumstances_changed',
          'other'
        )
      );
  END IF;
END $$;

-- Partial index for the T-5 cron query. Excludes rows where trial_ends_at
-- is NULL (data integrity edge case per database-reviewer H2).
CREATE INDEX IF NOT EXISTS idx_parent_subscriptions_trial_reminder_due
  ON parent_subscriptions(trial_ends_at)
  WHERE status = 'trial'
    AND trial_reminder_5d_sent_at IS NULL
    AND trial_ends_at IS NOT NULL;

COMMENT ON COLUMN parent_subscriptions.trial_reminder_5d_sent_at IS
  'Set by /api/cron/trial-reminders when the T-5 day trial-expiry email is sent. Idempotent — prevents the same row from being emailed twice.';

COMMENT ON COLUMN parent_subscriptions.cancellation_reason IS
  'Captured by the S9 cancel flow. One of: too_expensive, not_using, service_issue, circumstances_changed, other. Drives product learning.';

COMMENT ON COLUMN parent_subscriptions.cancellation_reason_text IS
  'Optional freeform textarea from the S9 cancel flow. Captures verbatim user feedback when the parent felt the radio reason did not capture their situation.';

COMMIT;
