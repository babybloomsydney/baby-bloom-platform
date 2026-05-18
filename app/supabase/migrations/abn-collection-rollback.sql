-- =============================================================================
-- T-020 — Rollback for abn-collection.sql.
-- =============================================================================
-- Drops the 6 new columns + format check + 2 partial indexes. Does NOT drop
-- the pre-existing `abn` column (added by payments-foundation.sql and inert
-- pre-T-020). Money safety unaffected by rollback: pre-T-020 state was "no
-- ABN gate" which is equivalent to T-018's "release whatever passes existing
-- gates" — Lock 1-4 from T-018 remain intact.
-- =============================================================================

DROP FUNCTION IF EXISTS increment_abn_push_attempts(UUID, TIMESTAMPTZ, TEXT, INTEGER);

-- Restore the pre-T-020 allow-list (drop our 3 new entries).
ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;

ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_action_type_check
  CHECK (action_type IN (
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
    'invite_created', 'invite_connected', 'invite_declined', 'invite_revoked',
    'nanny_left_child', 'nanny_removed_by_parent', 'orphan_cleanup_run', 'signup_via_invite',
    'trial_started', 'trial_lapsed',
    'subscription_started', 'subscription_renewed', 'subscription_past_due',
    'subscription_recovered', 'subscription_cancelled', 'subscription_lapsed',
    'subscription_converted_upfront_to_monthly',
    'trial_notification_sent', 'conversion_notification_sent',
    'commission_scheduled', 'commission_released', 'commission_held', 'commission_cancelled',
    'payout_send_failed', 'payout_paid', 'payout_failed',
    'payout_application_started', 'payout_application_status_changed',
    'nanny_account_updated',
    'refund_requested', 'refund_decision', 'refund_processed', 'refund_processing_failed',
    'refund_manually_completed', 'duplicate_checkout_refunded',
    'test_user_flag_changed',
    'stripe_webhook_received', 'stripe_webhook_processed', 'stripe_reconciliation_drift',
    'cron_run', 'kill_switch_blocked',
    'serr_report_generated', 'serr_report_lodged',
    'payouts_held_due_to_no_abn',
    'subscribe_invite_created', 'subscribe_invite_redeemed', 'subscribe_invite_revoked',
    'contact_message_received', 'contact_message_replied',
    'account_closure_completed'
  ));

DROP INDEX IF EXISTS idx_nannies_abn_ready;
DROP INDEX IF EXISTS idx_nannies_abn_flagged;

ALTER TABLE nannies
  DROP CONSTRAINT IF EXISTS abn_format_check,
  DROP COLUMN IF EXISTS abn_updated_at,
  DROP COLUMN IF EXISTS abn_last_pushed_to_stripe_at,
  DROP COLUMN IF EXISTS abn_push_attempts,
  DROP COLUMN IF EXISTS abn_push_last_error,
  DROP COLUMN IF EXISTS abn_push_last_failed_at,
  DROP COLUMN IF EXISTS abn_push_flagged_at,
  -- Also drop the pre-existing inert `abn` column. Bailey 2026-05-15:
  -- BB no longer tracks ABN at all. Stripe collects it in the embed.
  -- Safe to drop — pre-flight audit confirmed 0 non-null values.
  DROP COLUMN IF EXISTS abn;
