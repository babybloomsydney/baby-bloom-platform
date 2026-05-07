-- Rollback for katie-internal-notes.sql

ALTER TABLE public.bapp_logs
  DROP COLUMN IF EXISTS internal_notes;
