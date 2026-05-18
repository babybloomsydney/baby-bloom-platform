-- =============================================================================
-- T-018 rollback: drop trigger v2 + restore T-016 trigger v1 (frozen variant).
-- =============================================================================

DROP TRIGGER IF EXISTS trg_cancel_inflight_commission_on_terminal_status
  ON parent_subscriptions;
DROP FUNCTION IF EXISTS cancel_inflight_commission_on_terminal_status();

-- Restore T-016 freeze function.
CREATE OR REPLACE FUNCTION freeze_inflight_commission_on_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_paying_old BOOLEAN;
  v_terminal_new BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  v_paying_old := OLD.status IN ('trial', 'active_monthly', 'active_upfront', 'past_due');
  v_terminal_new := NEW.status IN ('cancelled', 'lapsed');
  IF NOT (v_paying_old AND v_terminal_new) THEN
    RETURN NEW;
  END IF;
  UPDATE nanny_payouts
     SET status = 'frozen',
         frozen_at = COALESCE(frozen_at, NOW()),
         failure_reason = COALESCE(failure_reason, 'sub_status_trigger:' || NEW.status)
   WHERE parent_subscription_id = NEW.id
     AND status IN ('pending', 'held');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_freeze_inflight_commission_on_terminal_status
  AFTER UPDATE OF status ON parent_subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION freeze_inflight_commission_on_terminal_status();
