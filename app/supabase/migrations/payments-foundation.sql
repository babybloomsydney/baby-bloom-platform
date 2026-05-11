-- ============================================================================
-- Migration: Payments — subscriptions, payouts, refunds, soft-lock
-- File: app/supabase/migrations/payments-foundation.sql
-- Pre-req: child-invites.sql migration applied (live since pre-2026-05-09)
-- Spec: system/APP/PAYMENTS/03-data-model.md
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Extend activity_logs CHECK constraint to allow new payment events.
--    Re-add with all existing values (from supabase-setup.sql) plus new
--    payment events. Drop-and-recreate is the only way to extend a CHECK.
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
    -- Values added post-supabase-setup.sql by child-linking work — present
    -- in production rows but never made it back into the canonical CHECK.
    -- This migration is the chance to fold them in.
    'child_deleted',
    'invite_created',
    'invite_declined',
    'invite_revoked',
    'orphan_cleanup_run',
    'signup_via_invite',
    -- New payment events (per 03-data-model.md §0)
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

-- ----------------------------------------------------------------------------
-- 1. parent_subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE parent_subscriptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status                      TEXT NOT NULL CHECK (status IN (
    'trial',
    'active_monthly',
    'active_upfront',
    'past_due',
    'cancelled',
    'lapsed'
  )),

  trial_started_at            TIMESTAMPTZ,
  trial_ends_at               TIMESTAMPTZ,

  paid_period_starts_at       TIMESTAMPTZ,
  paid_period_ends_at         TIMESTAMPTZ,

  has_used_trial              BOOLEAN NOT NULL DEFAULT FALSE,

  stripe_customer_id          TEXT,
  stripe_subscription_id      TEXT,
  stripe_payment_intent_id    TEXT,

  cancelled_at                TIMESTAMPTZ,
  cancellation_reason         TEXT,

  past_due_grace_ends_at      TIMESTAMPTZ,

  subscription_cycle          INTEGER NOT NULL DEFAULT 1,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_parent_subscriptions_one_per_parent
  ON parent_subscriptions(parent_user_id);

CREATE INDEX idx_parent_subscriptions_status
  ON parent_subscriptions(status);

CREATE INDEX idx_parent_subscriptions_active
  ON parent_subscriptions(parent_user_id)
  WHERE status IN ('trial', 'active_monthly', 'active_upfront', 'past_due');

CREATE INDEX idx_parent_subscriptions_stripe_customer
  ON parent_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX idx_parent_subscriptions_stripe_subscription
  ON parent_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER set_parent_subscriptions_updated_at
  BEFORE UPDATE ON parent_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE parent_subscriptions IS
  'One row per parent (family). Tracks trial state + active subscription. Per-family, not per-child — multi-child families share one subscription.';
COMMENT ON COLUMN parent_subscriptions.has_used_trial IS
  'Lifetime guard. True once any trial has started. Prevents new trials after a lapse-and-return.';
COMMENT ON COLUMN parent_subscriptions.paid_period_ends_at IS
  'For active_monthly: end of current paid period. For active_upfront: child''s 5th birthday or upfront-end-date.';

-- ----------------------------------------------------------------------------
-- 2. nanny_payouts
-- ----------------------------------------------------------------------------
CREATE TABLE nanny_payouts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nanny_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  parent_subscription_id      UUID NOT NULL REFERENCES parent_subscriptions(id) ON DELETE RESTRICT,

  period_start                DATE NOT NULL,
  period_end                  DATE NOT NULL,

  amount_aud_cents            INTEGER NOT NULL CHECK (amount_aud_cents >= 0),
  commission_model_version    TEXT NOT NULL DEFAULT 'v1_flat'
    CHECK (commission_model_version IN ('v1_flat', 'v2_engagement')),

  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'held',
    'sending',
    'sent',
    'paid',
    'failed',
    'cancelled',
    'frozen'
  )),

  frozen_at                   TIMESTAMPTZ,

  stripe_transfer_id          TEXT,
  scheduled_release_at        TIMESTAMPTZ NOT NULL,
  sent_at                     TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  failed_at                   TIMESTAMPTZ,
  failure_reason              TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nanny_payouts_nanny       ON nanny_payouts(nanny_user_id);
CREATE INDEX idx_nanny_payouts_parent      ON nanny_payouts(parent_user_id);
CREATE INDEX idx_nanny_payouts_subscription ON nanny_payouts(parent_subscription_id);
CREATE INDEX idx_nanny_payouts_status      ON nanny_payouts(status);
CREATE INDEX idx_nanny_payouts_releasable
  ON nanny_payouts(scheduled_release_at)
  WHERE status IN ('pending', 'held');
CREATE INDEX idx_nanny_payouts_stripe_transfer
  ON nanny_payouts(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE UNIQUE INDEX idx_nanny_payouts_unique_per_period
  ON nanny_payouts(parent_subscription_id, period_start)
  WHERE status != 'cancelled';

CREATE TRIGGER set_nanny_payouts_updated_at
  BEFORE UPDATE ON nanny_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE nanny_payouts IS
  'Each scheduled or completed payout to a nanny. v1 commission engine inserts rows on a monthly cron after the second-payment safeguard.';
COMMENT ON COLUMN nanny_payouts.scheduled_release_at IS
  'The earliest date this payout can be sent. Enforces the second-payment safeguard (~30 days post-first-paid-charge).';

-- ----------------------------------------------------------------------------
-- 3. earnings_events
-- ----------------------------------------------------------------------------
CREATE TABLE earnings_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nanny_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_client_id             UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,

  event_kind                  TEXT NOT NULL CHECK (event_kind IN (
    'activity_logged',
    'observation_logged',
    'report_completed',
    'diary_entry',
    'progress_update',
    'photo_uploaded'
  )),

  source_table                TEXT NOT NULL,
  source_id                   UUID NOT NULL,

  earnings_value_aud_cents    INTEGER NOT NULL CHECK (earnings_value_aud_cents >= 0),

  applied_to_payout_id        UUID REFERENCES nanny_payouts(id) ON DELETE SET NULL,

  occurred_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_earnings_events_nanny       ON earnings_events(nanny_user_id);
CREATE INDEX idx_earnings_events_parent      ON earnings_events(parent_user_id);
CREATE INDEX idx_earnings_events_unapplied   ON earnings_events(nanny_user_id, occurred_at)
  WHERE applied_to_payout_id IS NULL;
CREATE INDEX idx_earnings_events_source      ON earnings_events(source_table, source_id);

COMMENT ON TABLE earnings_events IS
  'Shadow ledger. v1 inserts rows but does not use them for payout calculation. v2 will pay based on these rows. Lets v2 launch with full historical data.';

-- ----------------------------------------------------------------------------
-- 4. refund_requests
-- ----------------------------------------------------------------------------
CREATE TABLE refund_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parent_subscription_id      UUID NOT NULL REFERENCES parent_subscriptions(id) ON DELETE RESTRICT,
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  reason_category             TEXT CHECK (reason_category IN (
    'major_problem',
    'reasonable_cause',
    'change_of_mind',
    'other'
  )),
  reason_text                 TEXT NOT NULL,

  calculated_refund_aud_cents INTEGER NOT NULL,
  calculation_breakdown       JSONB NOT NULL,

  status                      TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'pending_processing',
    'approved',
    'denied',
    'partially_approved',
    'cancelled_by_user'
  )),

  reviewed_by_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,
  approved_amount_aud_cents   INTEGER CHECK (approved_amount_aud_cents IS NULL OR approved_amount_aud_cents >= 0),
  reviewer_notes              TEXT,

  stripe_refund_id            TEXT,
  refund_processed_at         TIMESTAMPTZ,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refund_requests_status     ON refund_requests(status);
CREATE INDEX idx_refund_requests_parent     ON refund_requests(parent_user_id);
CREATE INDEX idx_refund_requests_pending    ON refund_requests(created_at)
  WHERE status = 'pending_review';

CREATE TRIGGER set_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE refund_requests IS
  'Manual review queue for refund requests. Bailey/admin reviews each one. calculation_breakdown JSONB shows the formula math at request time for transparency.';

-- ----------------------------------------------------------------------------
-- 5. nannies — add Stripe Connect fields + payout application state
-- ----------------------------------------------------------------------------
ALTER TABLE nannies
  ADD COLUMN abn                            TEXT,
  ADD COLUMN stripe_connect_account_id      TEXT UNIQUE,
  ADD COLUMN charges_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN payouts_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN connect_onboarded_at           TIMESTAMPTZ,
  ADD COLUMN payout_application_status      TEXT NOT NULL DEFAULT 'not_applied'
    CHECK (payout_application_status IN (
      'not_applied',
      'in_progress',
      'pending_review',
      'approved',
      'requires_action',
      'rejected'
    )),
  ADD COLUMN payout_application_started_at  TIMESTAMPTZ,
  ADD COLUMN payout_application_completed_at TIMESTAMPTZ;

CREATE INDEX idx_nannies_stripe_connect_account
  ON nannies(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

CREATE INDEX idx_nannies_payout_application_status
  ON nannies(payout_application_status)
  WHERE payout_application_status IN ('in_progress', 'pending_review', 'requires_action');

COMMENT ON COLUMN nannies.abn IS
  'Australian Business Number. Required by ATO for payouts >A$75 to avoid 47% PAYG withholding.';
COMMENT ON COLUMN nannies.payouts_enabled IS
  'Synced from Stripe Connect webhook. True when Stripe will release payouts to the nanny''s bank.';

-- ----------------------------------------------------------------------------
-- 6. parents — add Stripe customer linkage
-- ----------------------------------------------------------------------------
ALTER TABLE parents
  ADD COLUMN stripe_customer_id           TEXT UNIQUE;

CREATE INDEX idx_parents_stripe_customer
  ON parents(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. child_client — soft-lock flag
-- ----------------------------------------------------------------------------
ALTER TABLE child_client
  ADD COLUMN feed_locked_for_nanny        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN feed_locked_at               TIMESTAMPTZ;

CREATE INDEX idx_child_client_feed_locked
  ON child_client(feed_locked_for_nanny)
  WHERE feed_locked_for_nanny = TRUE;

COMMENT ON COLUMN child_client.feed_locked_for_nanny IS
  'Soft-lock flag. True when nanny created child >=30 days ago and no parent has connected yet. Set by daily cron.';

-- ----------------------------------------------------------------------------
-- 8. child_invites — family trial start tracking
-- ----------------------------------------------------------------------------
ALTER TABLE child_invites
  ADD COLUMN family_trial_started_at      TIMESTAMPTZ;

COMMENT ON COLUMN child_invites.family_trial_started_at IS
  'Set on the invite that triggered the family trial (i.e. the first connect for that parent).';

-- ----------------------------------------------------------------------------
-- 8b. user_profiles — test-user bypass flag
-- ----------------------------------------------------------------------------
ALTER TABLE user_profiles
  ADD COLUMN is_test_user                 BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_user_profiles_test_user
  ON user_profiles(user_id)
  WHERE is_test_user = TRUE;

COMMENT ON COLUMN user_profiles.is_test_user IS
  'When true: family_has_access() returns true regardless of subscription, Stripe ops are skipped, commission flows are skipped if either party is flagged.';

-- ----------------------------------------------------------------------------
-- 8c. parents.bbapp_status + nannies.bbapp_status — funnel position rollup
-- ----------------------------------------------------------------------------
ALTER TABLE parents
  ADD COLUMN bbapp_status                INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN bbapp_status_updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_parents_bbapp_status
  ON parents(bbapp_status);

COMMENT ON COLUMN parents.bbapp_status IS
  'Funnel-position rollup. Code table at system/APP/PAYMENTS/15-admin-management.md §3a.';

ALTER TABLE nannies
  ADD COLUMN bbapp_status                INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN bbapp_status_updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_nannies_bbapp_status
  ON nannies(bbapp_status);

COMMENT ON COLUMN nannies.bbapp_status IS
  'Funnel-position rollup. Code table at system/APP/PAYMENTS/15-admin-management.md §3b.';

-- ----------------------------------------------------------------------------
-- 9. stripe_webhook_events — idempotency + audit log
-- ----------------------------------------------------------------------------
CREATE TABLE stripe_webhook_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id             TEXT NOT NULL UNIQUE,
  event_type                  TEXT NOT NULL,
  payload                     JSONB NOT NULL,
  received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at                TIMESTAMPTZ,
  processing_error            TEXT,
  retry_count                 INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_unprocessed
  ON stripe_webhook_events(received_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE stripe_webhook_events IS
  'Idempotency log. Webhook handler upserts on stripe_event_id; if already processed, no-op.';

-- ----------------------------------------------------------------------------
-- 10. RLS — all new tables enabled, policies defined
-- ----------------------------------------------------------------------------

ALTER TABLE parent_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_reads_own_subscription" ON parent_subscriptions
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "admin_reads_all_subscriptions" ON parent_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER TABLE nanny_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nanny_reads_own_payouts" ON nanny_payouts
  FOR SELECT USING (nanny_user_id = auth.uid());
CREATE POLICY "admin_reads_all_payouts" ON nanny_payouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER TABLE earnings_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nanny_reads_own_earnings_events" ON earnings_events
  FOR SELECT USING (nanny_user_id = auth.uid());

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_reads_own_refund_requests" ON refund_requests
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "parent_creates_own_refund_request" ON refund_requests
  FOR INSERT WITH CHECK (parent_user_id = auth.uid());
CREATE POLICY "admin_full_refund_access" ON refund_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 11. Helper functions
-- ----------------------------------------------------------------------------

-- family_has_access(parent_user_id) → BOOLEAN
CREATE OR REPLACE FUNCTION family_has_access(p_parent_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = p_parent_user_id
        AND is_test_user = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM parent_subscriptions
      WHERE parent_user_id = p_parent_user_id
        AND (
          (status = 'trial' AND trial_ends_at > NOW())
          OR (status IN ('active_monthly', 'active_upfront') AND paid_period_ends_at > NOW())
          OR (status = 'past_due' AND past_due_grace_ends_at > NOW())
        )
    );
$$;

REVOKE ALL ON FUNCTION family_has_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_has_access(UUID) TO authenticated;

-- start_family_trial_if_first(parent_user_id) → BOOLEAN
CREATE OR REPLACE FUNCTION start_family_trial_if_first(p_parent_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing_id  UUID;
  v_has_used     BOOLEAN;
  v_is_test_user BOOLEAN;
BEGIN
  SELECT is_test_user INTO v_is_test_user
  FROM user_profiles WHERE user_id = p_parent_user_id;
  IF v_is_test_user THEN
    RETURN FALSE;
  END IF;

  SELECT id, has_used_trial INTO v_existing_id, v_has_used
  FROM parent_subscriptions
  WHERE parent_user_id = p_parent_user_id;

  IF v_existing_id IS NOT NULL AND v_has_used THEN
    RETURN FALSE;
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO parent_subscriptions (
      parent_user_id, status, trial_started_at, trial_ends_at, has_used_trial
    ) VALUES (
      p_parent_user_id, 'trial', NOW(), NOW() + INTERVAL '30 days', TRUE
    );
    RETURN TRUE;
  END IF;

  RAISE WARNING 'Unexpected subscription row exists without has_used_trial for parent %', p_parent_user_id;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION start_family_trial_if_first(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_family_trial_if_first(UUID) TO authenticated;

-- update_soft_lock(child_client_id, locked) → VOID
CREATE OR REPLACE FUNCTION update_soft_lock(p_child_id UUID, p_locked BOOLEAN)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE child_client
  SET feed_locked_for_nanny = p_locked,
      feed_locked_at = CASE WHEN p_locked THEN NOW() ELSE NULL END
  WHERE id = p_child_id;
$$;

REVOKE ALL ON FUNCTION update_soft_lock(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_soft_lock(UUID, BOOLEAN) TO authenticated;

COMMIT;
