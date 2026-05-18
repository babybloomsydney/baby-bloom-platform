-- ============================================================
-- External U3 Position — Forward Migration
-- ============================================================
-- Adds a backend-only `lead_signals` JSONB column to nanny_leads
-- to capture qualifying signals (first signal: external_u3_position).
--
-- Apply via: Supabase SQL Editor (project ref: umkqevipzmoovyrnynrf)
-- Idempotent: uses IF NOT EXISTS — safe to re-run.
-- Reversible: see migration-rollback.sql in this folder.
-- ============================================================

BEGIN;

-- 1. Add the column
ALTER TABLE nanny_leads
  ADD COLUMN IF NOT EXISTS lead_signals JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Document its purpose for future maintainers
COMMENT ON COLUMN nanny_leads.lead_signals IS
  'Backend-only qualifying signals captured during the application funnel. '
  'Not exposed to AI bio generation, the nanny profile, or any parent-facing surface. '
  'Schema-flexible JSONB — new keys can be added in code without further migrations. '
  'Current keys: external_u3_position (boolean). See system/forms/nanny-profile/Updates/.';

-- 3. Partial index for fast hot-lead lookups
--    Targets the common admin query: "show me all unconverted leads currently
--    nannying for an under-3 child". The partial WHERE keeps the index small —
--    only rows where the answer is explicitly true are indexed.
CREATE INDEX IF NOT EXISTS idx_nanny_leads_external_u3_position
  ON nanny_leads ((lead_signals->>'external_u3_position'))
  WHERE (lead_signals->>'external_u3_position') = 'true';

-- 4. Verify (read-only — no state change)
DO $$
DECLARE
  col_count INTEGER;
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'nanny_leads'
     AND column_name = 'lead_signals';

  SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'idx_nanny_leads_external_u3_position';

  IF col_count <> 1 THEN
    RAISE EXCEPTION 'Migration verification failed: lead_signals column not found.';
  END IF;

  IF idx_count <> 1 THEN
    RAISE EXCEPTION 'Migration verification failed: idx_nanny_leads_external_u3_position not created.';
  END IF;

  RAISE NOTICE 'External U3 Position migration applied successfully.';
END $$;

COMMIT;

-- ============================================================
-- Post-apply sanity query (run manually):
--
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'nanny_leads' AND column_name = 'lead_signals';
--
-- Expected:
--   column_name   | data_type | column_default              | is_nullable
--   lead_signals  | jsonb     | '{}'::jsonb                 | NO
-- ============================================================
