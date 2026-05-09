-- ============================================================================
-- Rollback: Payments — subscriptions, payouts, refunds, soft-lock
-- File: app/supabase/migrations/payments-foundation-rollback.sql
-- Pairs with: payments-foundation.sql
-- ============================================================================

BEGIN;

-- 11. Helper functions
DROP FUNCTION IF EXISTS update_soft_lock(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS start_family_trial_if_first(UUID);
DROP FUNCTION IF EXISTS family_has_access(UUID);

-- 9. Webhook events table
DROP TABLE IF EXISTS stripe_webhook_events;

-- 8c. bbapp_status columns
DROP INDEX IF EXISTS idx_nannies_bbapp_status;
ALTER TABLE nannies
  DROP COLUMN IF EXISTS bbapp_status_updated_at,
  DROP COLUMN IF EXISTS bbapp_status;

DROP INDEX IF EXISTS idx_parents_bbapp_status;
ALTER TABLE parents
  DROP COLUMN IF EXISTS bbapp_status_updated_at,
  DROP COLUMN IF EXISTS bbapp_status;

-- 8b. Test-user flag
DROP INDEX IF EXISTS idx_user_profiles_test_user;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_test_user;

-- 8. child_invites column
ALTER TABLE child_invites DROP COLUMN IF EXISTS family_trial_started_at;

-- 7. child_client soft-lock columns
DROP INDEX IF EXISTS idx_child_client_feed_locked;
ALTER TABLE child_client
  DROP COLUMN IF EXISTS feed_locked_at,
  DROP COLUMN IF EXISTS feed_locked_for_nanny;

-- 6. parents Stripe customer
DROP INDEX IF EXISTS idx_parents_stripe_customer;
ALTER TABLE parents DROP COLUMN IF EXISTS stripe_customer_id;

-- 5. nannies Stripe Connect columns
DROP INDEX IF EXISTS idx_nannies_payout_application_status;
DROP INDEX IF EXISTS idx_nannies_stripe_connect_account;
ALTER TABLE nannies
  DROP COLUMN IF EXISTS payout_application_completed_at,
  DROP COLUMN IF EXISTS payout_application_started_at,
  DROP COLUMN IF EXISTS payout_application_status,
  DROP COLUMN IF EXISTS connect_onboarded_at,
  DROP COLUMN IF EXISTS payouts_enabled,
  DROP COLUMN IF EXISTS charges_enabled,
  DROP COLUMN IF EXISTS stripe_connect_account_id,
  DROP COLUMN IF EXISTS abn;

-- 4. refund_requests
DROP TABLE IF EXISTS refund_requests;

-- 3. earnings_events
DROP TABLE IF EXISTS earnings_events;

-- 2. nanny_payouts
DROP TABLE IF EXISTS nanny_payouts;

-- 1. parent_subscriptions
DROP TABLE IF EXISTS parent_subscriptions;

-- 0. activity_logs CHECK — restore original (without payment events)
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;
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
    'email_sent', 'notification_sent', 'file_deleted'
  ));

COMMIT;
