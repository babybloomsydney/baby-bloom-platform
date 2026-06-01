-- ─────────────────────────────────────────────────────────────────────
-- Relax the `email_logs.email_type` CHECK constraint
--
-- The original schema (`docs/04-technical/database/supabase-setup.sql`)
-- pinned email_type to a fixed enumeration. Since then many new types
-- have been added in app code without keeping the constraint in sync —
-- `dfy_nanny_notification`, `bsr_*`, `welcome-invite-parent`, etc. all
-- write successfully because someone manually expanded the constraint
-- via SQL Editor at some point.
--
-- The latest addition that's NOT covered: `welcome_adv_parent` (T-040
-- Step 1c — the matchmaking-live welcome for advanced-funnel parents).
-- Without this migration the sendEmail call succeeds (Resend / dry-run)
-- but the email_logs insert is rejected with constraint code 23514 and
-- the error is discarded inside logEmail.
--
-- Decision: drop the CHECK constraint entirely rather than re-enumerate
-- it. Email types are an app-code concern, not a DB invariant — every
-- new feature requiring a new type would otherwise need a fresh
-- migration. Dropping is forward-compatible + reversible.
--
-- Authored 2026-06-01 by parentOnboardFix300526 during the T-040
-- autofire E2E build.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE email_logs
  DROP CONSTRAINT IF EXISTS email_logs_email_type_check;

COMMIT;

-- Verify the constraint is gone (should return 0 rows):
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'email_logs'::regclass
--     AND conname = 'email_logs_email_type_check';
