-- ============================================================
-- T-022 — Bonus Program Onboarding Rollback
-- ============================================================
-- Reverses bonus-program-onboarding.sql. Only run if you need to
-- fully undo.
--
-- WARNING: This DESTROYS the bonus-program stamp data — any
-- `bonus_program_dismissed_at` / `bonus_program_completed_at`
-- timestamps + `child_invites.bonus_program` flags will be lost.
-- Take a backup of those columns first if you need to preserve them.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS idx_nannies_bonus_program_dismissed;

ALTER TABLE child_invites
  DROP COLUMN IF EXISTS bonus_program;

ALTER TABLE nannies
  DROP COLUMN IF EXISTS bonus_program_future_interest,
  DROP COLUMN IF EXISTS bonus_program_completed_at,
  DROP COLUMN IF EXISTS bonus_program_dismissed_at;

COMMIT;
