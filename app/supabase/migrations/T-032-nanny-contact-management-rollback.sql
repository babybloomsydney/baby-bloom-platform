-- =============================================================================
-- T-032 — Rollback for nanny-contact-management.sql
-- =============================================================================
-- Reverse of T-032-nanny-contact-management.sql. Drops the three tables in
-- FK order, drops the trigger functions (CASCADE removes any leftover
-- triggers), and removes nothing else.
--
-- The migration is idempotent (IF NOT EXISTS / DROP IF EXISTS), so re-running
-- the forward migration after this rollback is safe.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS lead_notes          CASCADE;
DROP TABLE IF EXISTS lead_contacts       CASCADE;
DROP TABLE IF EXISTS nanny_contact_state CASCADE;

DROP FUNCTION IF EXISTS ensure_nanny_contact_state()  CASCADE;
DROP FUNCTION IF EXISTS recompute_last_contact()      CASCADE;
DROP FUNCTION IF EXISTS lead_contacts_touch_edit()    CASCADE;
DROP FUNCTION IF EXISTS t032_touch_updated_at()       CASCADE;

COMMIT;
