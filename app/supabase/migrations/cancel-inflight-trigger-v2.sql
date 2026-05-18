-- =============================================================================
-- T-018 — Trigger v2: cancel-in-flight on terminal status transition
-- Replaces T-016's freeze trigger.
-- =============================================================================
--
-- Why:
--   T-016 introduced freeze/unfreeze semantics for commission rows when
--   a parent cancelled or refunded. T-018 simplifies to cancel-terminal:
--   same dashboard outcome (nanny still sees A$100/family when in state D),
--   fewer state transitions, no row resurrection on resubscribe, ~150 LoC
--   deleted from the unfreeze* family.
--
-- Semantics (same as T-016 trigger v1):
--   - Fires AFTER UPDATE OF status ON parent_subscriptions
--   - WHEN clause: status actually changed
--   - Acts only when transitioning from paying state to cancelled/lapsed
--   - Touches rows with status IN ('pending', 'held') for the subscription
--
-- Different behaviour (v1 → v2):
--   - Sets status='cancelled' instead of 'frozen'
--   - Drops the frozen_at write (column kept for legacy compatibility)
--
-- SECURITY DEFINER + pinned search_path: carried over from T-016
-- (RLS hardening + search-path injection defence).
--
-- Spec: system/APP/PAYMENTS/PAYOUTS/03-db-layer.md
-- =============================================================================

-- Drop T-016 trigger + function first (idempotent).
DROP TRIGGER IF EXISTS trg_freeze_inflight_commission_on_terminal_status
  ON parent_subscriptions;
DROP FUNCTION IF EXISTS freeze_inflight_commission_on_terminal_status();

CREATE OR REPLACE FUNCTION cancel_inflight_commission_on_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_paying_old BOOLEAN;
  v_terminal_new BOOLEAN;
BEGIN
  -- Belt-and-suspenders: no-op when status didn't actually change.
  -- The WHEN clause already filters this, but a future migration that
  -- replaces the trigger without the clause would still be safe.
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only act when transitioning FROM a paying state TO a non-paying
  -- terminal state. Other transitions (trial → active_monthly,
  -- cancelled → lapsed via the expire cron) are no-ops.
  v_paying_old := OLD.status IN ('trial', 'active_monthly', 'active_upfront', 'past_due');
  v_terminal_new := NEW.status IN ('cancelled', 'lapsed');

  IF NOT (v_paying_old AND v_terminal_new) THEN
    RETURN NEW;
  END IF;

  -- Cancel in-flight rows. Zero matching rows is normal (e.g. trial
  -- cancelled before any commission was scheduled). `paid` rows are
  -- the nanny's per spec — never clawed back. `cancelled` rows are
  -- left alone (idempotent: app-level call runs first; this trigger
  -- then matches zero rows because the WHERE filter excludes 'cancelled').
  --
  -- failure_reason is set to a distinguishable tag (sub_status_trigger:<status>)
  -- so reconciliation can tell trigger-driven cancellations apart from
  -- webhook-driven (`parent_cancelled`) or refund-flow (`parent_refunded`).
  -- COALESCE preserves any prior tag set by the app-level call.
  UPDATE nanny_payouts
     SET status = 'cancelled',
         failure_reason = COALESCE(failure_reason, 'sub_status_trigger:' || NEW.status)
   WHERE parent_subscription_id = NEW.id
     AND status IN ('pending', 'held');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION cancel_inflight_commission_on_terminal_status() IS
  'T-018: auto-cancel in-flight nanny_payouts rows when parent_subscriptions.status transitions to cancelled/lapsed. Replaces T-016 freeze trigger.';

CREATE TRIGGER trg_cancel_inflight_commission_on_terminal_status
  AFTER UPDATE OF status ON parent_subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION cancel_inflight_commission_on_terminal_status();

COMMENT ON TRIGGER trg_cancel_inflight_commission_on_terminal_status
  ON parent_subscriptions IS
  'T-018: fires on status change. WHEN clause skips no-op writes.';
