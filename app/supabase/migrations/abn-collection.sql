-- =============================================================================
-- T-020 — ABN collection columns on nannies + format check + indexes.
-- =============================================================================
-- Adds the columns required by T-020's write-before-release model + 3-strike
-- retry rule. The `abn` column already exists from payments-foundation.sql
-- (added inert there); this migration adds the surrounding tracking columns
-- + constraint + indexes that make T-020's release-cron gate work.
--
-- Forward + rollback. See abn-collection-rollback.sql.
-- Pre-flight audit (08-tests-and-rollout.md §Stage P) confirmed 0 nannies
-- currently in verified|approved+payouts_enabled state — zero blast radius
-- at deploy moment.
-- =============================================================================

ALTER TABLE nannies
  -- When BB column was last updated (BB form or admin tooling).
  ADD COLUMN abn_updated_at               TIMESTAMPTZ,

  -- When the release-cron last successfully pushed to Stripe. Audit only.
  ADD COLUMN abn_last_pushed_to_stripe_at TIMESTAMPTZ,

  -- 3-strike retry tracking (Bailey 2026-05-15 directive — write-before-release
  -- model means BB always pushes its value to Stripe before every transfer;
  -- if Stripe rejects 3 times in a row we flag for admin intervention).
  -- attempts increments on each failed push; reset on success OR when the
  -- nanny edits her ABN. flagged_at is set when attempts hits 3 — admin
  -- must intervene OR nanny must re-enter to clear it.
  ADD COLUMN abn_push_attempts            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN abn_push_last_error          TEXT,
  ADD COLUMN abn_push_last_failed_at      TIMESTAMPTZ,
  ADD COLUMN abn_push_flagged_at          TIMESTAMPTZ;

-- 11-digit numeric format check. Stricter ATO-checksum validation runs in
-- the TS layer (src/lib/payments/abn.ts). This catches obvious garbage at
-- INSERT/UPDATE — defence in depth for direct admin tooling writes.
ALTER TABLE nannies
  ADD CONSTRAINT abn_format_check
  CHECK (abn IS NULL OR abn ~ '^[0-9]{11}$');

-- Index for the release-payouts cron's "ready to push" subset — nannies
-- with an ABN that aren't flagged for admin attention. Partial index so
-- it stays small.
CREATE INDEX idx_nannies_abn_ready
  ON nannies(user_id)
  WHERE abn IS NOT NULL AND abn_push_flagged_at IS NULL;

-- Index for admin dashboard query: nannies needing manual intervention.
CREATE INDEX idx_nannies_abn_flagged
  ON nannies(abn_push_flagged_at)
  WHERE abn_push_flagged_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Atomic 3-strike increment RPC.
-- ----------------------------------------------------------------------------
-- Plain read-then-write would race when two cron runs overlap (manual rerun +
-- scheduled, or a slow run still in-flight when the next day fires). The race
-- could let a nanny stay under the flag threshold indefinitely. This function
-- runs the increment + threshold check + flag write in one SQL statement so
-- the DB is the source of truth for the counter, not the app.
CREATE OR REPLACE FUNCTION increment_abn_push_attempts(
  p_nanny_id     UUID,
  p_now          TIMESTAMPTZ,
  p_error        TEXT,
  p_threshold    INTEGER
)
RETURNS TABLE (
  new_attempts INTEGER,
  flagged_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts INTEGER;
  v_flagged  TIMESTAMPTZ;
BEGIN
  UPDATE nannies
    SET abn_push_attempts        = abn_push_attempts + 1,
        abn_push_last_error      = p_error,
        abn_push_last_failed_at  = p_now,
        abn_push_flagged_at      = CASE
                                     WHEN abn_push_attempts + 1 >= p_threshold THEN p_now
                                     ELSE NULL
                                   END
    WHERE id = p_nanny_id
  RETURNING abn_push_attempts, abn_push_flagged_at
    INTO v_attempts, v_flagged;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nanny % not found', p_nanny_id;
  END IF;

  new_attempts := v_attempts;
  flagged_at   := v_flagged;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION increment_abn_push_attempts IS
  'T-020 — atomic increment of abn_push_attempts + threshold-based flag write. Used by release-payouts cron to avoid TOCTOU races across overlapping cron runs.';

COMMENT ON COLUMN nannies.abn IS
  'Australian Business Number. 11-digit string. BB is the canonical writer; release-payouts cron pushes this value to Stripe before every transfer (write-before-release model). T-020.';

-- ----------------------------------------------------------------------------
-- Extend activity_logs.action_type CHECK constraint with T-020 events.
-- ----------------------------------------------------------------------------
-- The constraint is an allow-list; new action_types must be added here or
-- the INSERT silently rejects with `activity_logs_action_type_check`. Drop
-- + re-create with the existing list (from payments-frontend.sql) plus the
-- three T-020 entries.
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
    -- FRONTEND build values (from payments-frontend.sql).
    'subscribe_invite_created',
    'subscribe_invite_redeemed',
    'subscribe_invite_revoked',
    'contact_message_received',
    'contact_message_replied',
    'account_closure_completed',
    -- T-020 NEW.
    'abn_updated',
    'abn_push_flagged_for_admin',
    'abn_removed_from_stripe_externally'
  ));
COMMENT ON COLUMN nannies.abn_updated_at IS
  'Last BB-side write to abn column. Set by setNannyAbn server action. T-020.';
COMMENT ON COLUMN nannies.abn_last_pushed_to_stripe_at IS
  'Audit timestamp of last successful accounts.update push from release-payouts cron. T-020.';
COMMENT ON COLUMN nannies.abn_push_attempts IS
  'Consecutive failed pushes. Reset on success or on BB-side edit. Flagged at 3 (T-020 3-strike rule).';
COMMENT ON COLUMN nannies.abn_push_last_error IS
  'Most recent Stripe push error message. Reset when push succeeds. T-020.';
COMMENT ON COLUMN nannies.abn_push_last_failed_at IS
  'Timestamp of most recent push failure. Reset when push succeeds. T-020.';
COMMENT ON COLUMN nannies.abn_push_flagged_at IS
  'Set when abn_push_attempts hits 3. Cron skips flagged nannies entirely. Cleared by admin or by nanny editing her ABN. T-020.';
