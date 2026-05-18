-- Fix: align the `nannies.payout_application_status` CHECK constraint
-- with the values the application code actually writes.
--
-- The original migration listed:
--   'not_applied', 'in_progress', 'pending_review', 'approved',
--   'requires_action', 'rejected'
--
-- But every handler / page in `src/` writes:
--   'verified', 'restricted', 'pending'  (etc.)
--
-- Every Connect `account.updated` webhook fails with
-- `nannies_payout_application_status_check` until this is aligned.
-- We accept BOTH naming sets (the migration's + the code's) so the
-- update is non-destructive — no data migration needed.
--
-- Bailey bug 2026-05-13.

BEGIN;

ALTER TABLE nannies
  DROP CONSTRAINT IF EXISTS nannies_payout_application_status_check;

ALTER TABLE nannies
  ADD CONSTRAINT nannies_payout_application_status_check
  CHECK (payout_application_status IN (
    'not_applied',
    'in_progress',
    'pending',
    'pending_review',
    'verified',
    'approved',
    'restricted',
    'requires_action',
    'rejected'
  ));

COMMIT;
