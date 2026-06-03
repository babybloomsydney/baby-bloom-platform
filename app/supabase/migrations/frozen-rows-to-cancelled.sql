-- =============================================================================
-- T-018 one-shot data migration: existing 'frozen' rows → 'cancelled'.
-- =============================================================================
--
-- Pre-flight audit 2026-05-14: 0 rows in production (all already patched).
-- Migration is a defensive no-op against production; remains useful for
-- replay against shadow DBs / future dev environments seeded from old data.
--
-- Audit tag (failure_reason='t018_frozen_to_cancelled') enables the
-- rollback to invert ONLY rows this migration flipped, preserving rows
-- cancelled by other paths.
-- =============================================================================

UPDATE nanny_payouts
   SET status = 'cancelled',
       failure_reason = COALESCE(failure_reason, 't018_frozen_to_cancelled')
 WHERE status = 'frozen';
