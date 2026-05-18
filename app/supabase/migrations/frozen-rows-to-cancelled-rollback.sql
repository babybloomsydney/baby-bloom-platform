-- =============================================================================
-- T-018 inverse data migration: rollback the frozen→cancelled flip.
-- =============================================================================
--
-- ORDERING REQUIREMENT (CRITICAL):
--   Must run AFTER cancel-inflight-trigger-v2-rollback.sql.
--   Running this script while the v2 trigger is still live leaves
--   restored `frozen` rows in the DB with no unfreeze path and a
--   trigger that doesn't recognise `frozen` as actionable. Any
--   subsequent subscription status UPDATE could either ignore those
--   rows entirely (silently stuck) or interact unexpectedly.
--
-- The DO $$ block below asserts the trigger has been rolled back
-- before this script proceeds.
--
-- Only flips rows this migration tagged. Preserves rows cancelled
-- by other paths (webhook, refund flow, trigger).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_cancel_inflight_commission_on_terminal_status'
  ) THEN
    RAISE EXCEPTION
      'T-018 data rollback cannot run while v2 trigger is live. '
      'Apply cancel-inflight-trigger-v2-rollback.sql first.';
  END IF;
END $$;

UPDATE nanny_payouts
   SET status = 'frozen',
       frozen_at = COALESCE(frozen_at, NOW()),
       failure_reason = NULL
 WHERE failure_reason = 't018_frozen_to_cancelled';
