-- ============================================================================
-- Rollback: Payments frontend migration
-- File: app/supabase/migrations/payments-frontend-rollback.sql
-- Reverses: payments-frontend.sql
-- Note: leaves cancellation_reason COLUMN intact — that column belongs to
--       payments-foundation.sql and predates this migration. We only added
--       a CHECK constraint to it; the rollback drops the constraint only.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 3. Drop parent_subscriptions additions: trial reminder column, freeform
--    cancellation text column, the CHECK constraint, and the partial index.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_parent_subscriptions_trial_reminder_due;

ALTER TABLE parent_subscriptions
  DROP CONSTRAINT IF EXISTS parent_subscriptions_cancellation_reason_check;

ALTER TABLE parent_subscriptions
  DROP COLUMN IF EXISTS cancellation_reason_text,
  DROP COLUMN IF EXISTS trial_reminder_5d_sent_at;

-- ----------------------------------------------------------------------------
-- 2. Drop contact_messages table (CASCADE drops indexes + policies + trigger)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS contact_messages CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Drop subscribe_invites table (CASCADE drops indexes + policies + trigger)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS subscribe_invites CASCADE;

-- ----------------------------------------------------------------------------
-- 0. Restore activity_logs CHECK constraint to the pre-frontend-migration
--    state. This assumes payments-foundation.sql remains applied.
-- ----------------------------------------------------------------------------
ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;

ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_action_type_check
  CHECK (action_type IN (
    -- Pre-existing values (from supabase-setup.sql + payments-foundation.sql)
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
    'child_deleted',
    'invite_created',
    'invite_connected',
    'invite_declined',
    'invite_revoked',
    'nanny_left_child',
    'nanny_removed_by_parent',
    'orphan_cleanup_run',
    'signup_via_invite',
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
    'payouts_held_due_to_no_abn'
  ));

COMMIT;
