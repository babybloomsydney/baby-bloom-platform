-- =============================================================================
-- T-016 — Universal freeze trigger on parent_subscriptions terminal transitions
-- =============================================================================
--
-- Bug context (2026-05-14):
--   When a parent self-served cancel via cancelSubscription.ts (or any code
--   path that bypassed `customer.subscription.deleted` webhook), in-flight
--   nanny_payouts rows were NOT flipped to `frozen`. A subsequent resubscribe
--   then ran `scheduleCommissionFor` which inserted a fresh row at the new
--   payment date — the unique partial index `(parent_subscription_id,
--   period_start) WHERE status != 'cancelled'` did NOT engage because the
--   two rows had different period_starts.
--
--   Result: the nanny dashboard summed two `pending`/`held` rows
--   ($100 each = $200 displayed). The `release-payouts` cron would have
--   eventually dispatched both — paying out 2x the correct commission.
--
-- App-level fix:
--   `cancelSubscription.ts` now calls `freezeInFlightCommissionForSubscription`
--   after the status flip (matching `handleSubscriptionDeleted` webhook).
--
-- This trigger:
--   Universal safeguard. ANY code path that transitions
--   `parent_subscriptions.status` FROM a paying state
--   {trial, active_monthly, active_upfront, past_due}
--   TO a non-paying terminal state {cancelled, lapsed}
--   auto-freezes pending/held nanny_payouts rows for that subscription.
--
--   The trigger fires AFTER UPDATE OF status WITHIN the same transaction as
--   the UPDATE statement. This is TRANSACTIONAL, not best-effort: if the
--   inner UPDATE fails (constraint violation, lock timeout), the parent
--   status UPDATE rolls back too. Caller sees a DB error and must retry.
--   That is the correct behaviour for money safety — half-cancelled
--   subscriptions with stuck pending rows are worse than a retryable error.
--
-- App-level call is a no-op post-trigger-deploy:
--   Because the trigger commits the freeze synchronously, the app-level
--   `freezeInFlightCommissionForSubscription` call in cancelSubscription.ts
--   finds zero rows to freeze (already frozen by the trigger). The
--   `commission_held` activity log entry it would have emitted does NOT
--   fire in normal operation. The forensic signal lives on the
--   `nanny_payouts.failure_reason` column instead, tagged
--   `sub_status_trigger:<status>` to distinguish from app-level reasons
--   `parent_cancelled` / `parent_refunded`. The app-level call is
--   retained to cover (a) the brief window before this migration is
--   applied to a fresh environment, and (b) any future scenario where
--   the trigger is rolled back.
--
--   Past `paid` rows are NEVER touched — those are the nanny's per spec.
--
-- Spec: system/APP/PAYMENTS/06-commission-system.md §1.5 stages 5 + 6,
--       §2 "Frozen state on parent cancellation".
--
-- SECURITY DEFINER rationale:
--   `nanny_payouts` has RLS enabled with only SELECT policies; no UPDATE
--   policy. Service-role callers bypass RLS today, but defining the
--   function with SECURITY DEFINER makes the trigger robust against any
--   future caller (including non-service-role admin tooling) — the inner
--   UPDATE runs as the function owner regardless of session role.
--   `SET search_path` is pinned to prevent search-path injection (a
--   well-known SECURITY DEFINER hazard).
-- =============================================================================

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
  -- Belt-and-suspenders: early-exit on no-op status writes. The trigger's
  -- WHEN clause already filters these out, but a future migration that
  -- replaces the trigger without copying the clause would still be safe.
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only act when the transition is FROM a paying state TO a non-paying
  -- terminal state. Other transitions (e.g. trial → active_monthly,
  -- cancelled → lapsed via the daily expire cron) are no-ops.
  v_paying_old := OLD.status IN ('trial', 'active_monthly', 'active_upfront', 'past_due');
  v_terminal_new := NEW.status IN ('cancelled', 'lapsed');

  IF NOT (v_paying_old AND v_terminal_new) THEN
    RETURN NEW;
  END IF;

  -- Freeze pending/held rows for this subscription. Zero matching rows
  -- is normal (e.g. trial cancelled before any commission was scheduled).
  -- `paid` rows are the nanny's per spec — never clawed back.
  -- `frozen`/`cancelled` rows are left alone (idempotent: app-level call
  -- runs first in `cancelSubscription.ts`; this trigger then matches zero
  -- rows because the WHERE filter `status IN ('pending', 'held')` no
  -- longer matches).
  --
  -- failure_reason is set to a distinguishable tag (`sub_status_trigger`)
  -- so reconciliation can tell trigger-driven freezes apart from
  -- webhook-driven `parent_cancelled` / refund-flow `parent_refunded`.
  -- COALESCE preserves any prior tag set by the app-level call.
  UPDATE nanny_payouts
     SET status = 'frozen',
         frozen_at = COALESCE(frozen_at, NOW()),
         failure_reason = COALESCE(failure_reason, 'sub_status_trigger:' || NEW.status)
   WHERE parent_subscription_id = NEW.id
     AND status IN ('pending', 'held');

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION freeze_inflight_commission_on_terminal_status() IS
  'T-016: auto-freeze pending/held nanny_payouts rows when parent_subscriptions.status transitions from a paying state to cancelled/lapsed. Universal safeguard for any code path that flips status.';

DROP TRIGGER IF EXISTS trg_freeze_inflight_commission_on_terminal_status
  ON parent_subscriptions;

CREATE TRIGGER trg_freeze_inflight_commission_on_terminal_status
  AFTER UPDATE OF status ON parent_subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION freeze_inflight_commission_on_terminal_status();

COMMENT ON TRIGGER trg_freeze_inflight_commission_on_terminal_status
  ON parent_subscriptions IS
  'T-016: fires on status change. WHEN clause skips no-op writes (UPDATE that touches status without changing it).';
