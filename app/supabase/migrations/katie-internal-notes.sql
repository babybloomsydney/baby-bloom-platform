-- ============================================================================
-- Migration: katie-internal-notes (A-09, 2026-05-07)
-- Adds:
--   - bapp_logs.internal_notes TEXT — Katie's private context-only notes on
--     a tile, never surfaced to the parent or nanny in the UI.
-- Depends on: education-app.sql (bapp_logs), katie-foundation.sql (is_active).
-- Rollback: katie-internal-notes-rollback.sql
--
-- Visibility model:
--   Postgres has no native column-level RLS, and the existing user_crud
--   policy on bapp_logs grants SELECT/INSERT/UPDATE/DELETE to anyone
--   with `user_has_child_access`. So if a client SELECTed the row it
--   would see internal_notes alongside everything else.
--
--   We DELIBERATELY do NOT add a column-level RLS workaround here. The
--   enforcement model is at the application layer:
--     - getFeed (src/lib/actions/bapp/feed.ts) enumerates the columns
--       it SELECTs and excludes internal_notes — the column never
--       reaches the client.
--     - Katie's context-builder reads internal_notes via the admin
--       client (createAdminClient, RLS-bypass) which is server-side
--       only.
--   Any future server action that wants to surface a tile to a user
--   MUST opt out of internal_notes by listing columns explicitly. This
--   is the same pattern used elsewhere in the app for fields like
--   `auth.users.encrypted_password` (never SELECTed by the app).
--
--   Future hardening option: add a Postgres VIEW `bapp_logs_user`
--   that excludes internal_notes and grant clients access to the view
--   only. Tracked, not done here — the explicit-SELECT path is enough
--   for v1 and avoids a second RLS surface to keep in sync.
-- ============================================================================

ALTER TABLE public.bapp_logs
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN public.bapp_logs.internal_notes IS
  'Katie''s private context-only notes on this tile. NEVER surfaced to the parent or nanny — application-layer SELECTs (getFeed and friends) deliberately exclude this column. Only Katie''s context-builder reads it, via the service-role admin client. Suitable storage for: "the parent flagged screen-time concerns", "child seemed quiet in the last observation", "tracking sleep regression that started 2 weeks ago" — anything Katie wants to remember about WHY this tile matters that the family does not need to see.';
