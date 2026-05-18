-- ============================================================
-- External U3 Position — Rollback Migration
-- ============================================================
-- Reverses migration.sql. Only run if you need to fully undo.
--
-- WARNING: This DESTROYS all captured lead_signals data,
-- including external_u3_position answers across all rows.
-- Take a backup of the column before running:
--
--   COPY (SELECT id, lead_signals FROM nanny_leads
--         WHERE lead_signals <> '{}'::jsonb)
--   TO '/tmp/lead_signals_backup.csv' CSV HEADER;
--
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS idx_nanny_leads_external_u3_position;

ALTER TABLE nanny_leads
  DROP COLUMN IF EXISTS lead_signals;

COMMIT;
