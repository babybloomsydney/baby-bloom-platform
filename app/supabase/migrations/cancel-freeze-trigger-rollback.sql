-- =============================================================================
-- T-016 — Rollback for cancel-freeze-trigger.sql
-- =============================================================================
--
-- Drops the trigger + function. Does NOT auto-unfreeze rows tagged with
-- 'sub_status_trigger:*' because those rows reflect real cancel/lapse
-- events that happened while the trigger was deployed — they SHOULD
-- stay frozen until an authorised unfreeze path runs (resubscribe via
-- `unfreezeEarningsOnResubscribe`, or an admin override).
--
-- If a clean-slate revert is needed during pre-production testing,
-- run the trigger-tagged rows through this commented-out block manually:
--
--   UPDATE nanny_payouts
--      SET status = 'pending',
--          frozen_at = NULL,
--          failure_reason = NULL
--    WHERE failure_reason LIKE 'sub_status_trigger:%';
--
-- DO NOT run that block on production — it would resurrect commission
-- rows for parents who legitimately cancelled.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_freeze_inflight_commission_on_terminal_status
  ON parent_subscriptions;

DROP FUNCTION IF EXISTS freeze_inflight_commission_on_terminal_status();
