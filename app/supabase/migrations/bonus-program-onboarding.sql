-- ============================================================
-- T-022 — Bonus Program Onboarding Migration
-- ============================================================
-- Adds 3 columns to `nannies` + 1 column to `child_invites` + a
-- partial index supporting future recovery-surface queries.
--
-- All additive, all nullable-or-defaulted, no existing data rewrite.
-- Apply via: Supabase SQL Editor.
-- Idempotent: uses IF NOT EXISTS — safe to re-run.
-- Reversible: see bonus-program-onboarding-rollback.sql in this folder.
--
-- Spec: system/forms/nanny-profile/Updates/Onboarding Flow/IMPLEMENTATION.md §6
-- ============================================================

BEGIN;

-- 1. Columns on `nannies` — onboarding-contributions flow stamps
ALTER TABLE nannies
  ADD COLUMN IF NOT EXISTS bonus_program_dismissed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS bonus_program_completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS bonus_program_future_interest BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN nannies.bonus_program_dismissed_at IS
  'Timestamp the nanny clicked "Add child later" on the onboarding contributions page. Currently no UI action sets this — reserved for future recovery surface.';
COMMENT ON COLUMN nannies.bonus_program_completed_at IS
  'Timestamp the nanny successfully added a child via the onboarding contributions page. Set by createChild when fromBonusProgram=true.';
COMMENT ON COLUMN nannies.bonus_program_future_interest IS
  'Reserved for v2 — opt-in for the recovery prompt. v1 leaves this false.';

-- 2. Column on `child_invites` — commission-attribution flag
ALTER TABLE child_invites
  ADD COLUMN IF NOT EXISTS bonus_program BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN child_invites.bonus_program IS
  'TRUE when this invite was minted via the bonus-program onboarding flow. Read by the commission engine for attribution.';

-- 3. Partial index — supports future recovery-surface queries.
--    "Show me nannies who dismissed contributions but never completed."
CREATE INDEX IF NOT EXISTS idx_nannies_bonus_program_dismissed
  ON nannies (bonus_program_dismissed_at)
  WHERE bonus_program_dismissed_at IS NOT NULL
    AND bonus_program_completed_at IS NULL;

-- 4. Verify (read-only — no state change)
DO $$
DECLARE
  nannies_col_count INTEGER;
  invites_col_count INTEGER;
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO nannies_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'nannies'
     AND column_name IN ('bonus_program_dismissed_at',
                         'bonus_program_completed_at',
                         'bonus_program_future_interest');

  SELECT COUNT(*) INTO invites_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'child_invites'
     AND column_name = 'bonus_program';

  SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'idx_nannies_bonus_program_dismissed';

  IF nannies_col_count <> 3 THEN
    RAISE EXCEPTION 'Migration verification failed: expected 3 nannies columns, found %.', nannies_col_count;
  END IF;

  IF invites_col_count <> 1 THEN
    RAISE EXCEPTION 'Migration verification failed: child_invites.bonus_program not found.';
  END IF;

  IF idx_count <> 1 THEN
    RAISE EXCEPTION 'Migration verification failed: idx_nannies_bonus_program_dismissed not created.';
  END IF;

  RAISE NOTICE 'T-022 Bonus Program Onboarding migration applied successfully.';
END $$;

COMMIT;

-- ============================================================
-- Post-apply sanity query (run manually):
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'nannies'
--     AND column_name LIKE 'bonus_program_%';
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'child_invites'
--     AND column_name = 'bonus_program';
-- ============================================================
