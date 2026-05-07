-- ============================================================================
-- Migration: sync-user-profile-email (A-10, 2026-05-07)
--
-- Mirrors `auth.users.email` → `public.user_profiles.email` whenever a user
-- successfully confirms an email-change. The mirror is enforced at the
-- DATABASE level so no app code path — present or future — can leave the
-- two in divergent states.
--
-- Why a trigger and not app-side sync:
--   * Supabase Auth handles the email-change ceremony entirely server-side
--     (token issuance, link expiry, double-confirm). The actual `auth.users`
--     row is updated by the auth gotrue service, not the app. App-side sync
--     would only catch the initial `auth.updateUser({email})` call — NOT
--     the confirmation, which is when the new value actually lands.
--   * `auth.users` may also be mutated by the Supabase admin API (e.g. an
--     ops engineer rotating an account's email through the dashboard).
--     Without a DB-level trigger, that bypass writes auth.users without
--     touching user_profiles.email, leaving the UI showing stale data and
--     a potential phishing vector if the new email isn't reflected.
--   * Defence-in-depth: even if the trigger fires under an unauthenticated
--     gotrue context, SECURITY DEFINER lets it write user_profiles cleanly,
--     bypassing RLS on user_profiles for this single, scoped purpose.
--
-- Behaviour:
--   * Fires AFTER UPDATE OF email, email_confirmed_at on auth.users.
--   * Acts ONLY when both:
--       - email actually changed (NEW.email IS DISTINCT FROM OLD.email)
--       - the new email is confirmed (NEW.email_confirmed_at IS NOT NULL)
--     The second condition is what makes this safe: a pending email-change
--     stores the requested address in `auth.users.email_change` (NOT in
--     `email`), so no row is mirrored until the user clicks the confirm
--     link and gotrue commits the new value.
--   * If the UPDATE on user_profiles raises (e.g. unique-email violation
--     because someone else already owns that address), the trigger lets
--     the exception propagate. That rolls back the auth.users update too —
--     consistent: either both rows reflect the new email, or neither does.
--
-- Failure modes guarded against:
--   * Search-path injection — `SET search_path = public, pg_catalog`
--     pinned at function-definition time.
--   * Permission escalation — function is OWNED BY postgres (Supabase
--     superuser); SECURITY DEFINER means it executes with that owner's
--     privileges regardless of who triggers it. The function body is
--     scoped: a single UPDATE keyed by user_id with no dynamic SQL.
--   * Trigger storms — narrow `OF email, email_confirmed_at` clause means
--     unrelated auth.users updates (last_sign_in_at, raw_app_meta_data,
--     etc.) do NOT fire this trigger.
--
-- Rollback: sync-user-profile-email-rollback.sql.
-- Idempotent forward apply: yes (CREATE OR REPLACE + DROP IF EXISTS).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_user_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Mirror only on a real, confirmed email change. The combination of
  -- "email moved" + "confirmed_at present" is the moment gotrue commits
  -- a successful email-change ceremony to auth.users.
  IF NEW.email IS DISTINCT FROM OLD.email
     AND NEW.email_confirmed_at IS NOT NULL
  THEN
    UPDATE public.user_profiles
       SET email      = NEW.email,
           updated_at = NOW()
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_user_profile_email() IS
  'A-10: Mirrors auth.users.email → user_profiles.email on confirmed email changes. SECURITY DEFINER + pinned search_path. Defence-in-depth so no app code path can diverge user_profiles.email from auth.users.email.';

-- Tighten ownership / privileges. The function is callable by the trigger
-- owner only; we deliberately do NOT grant EXECUTE to anon/authenticated.
-- Triggers in PG don't require EXECUTE privileges on the function for
-- the calling role, so revoking PUBLIC keeps app code from invoking the
-- function directly.
REVOKE ALL ON FUNCTION public.sync_user_profile_email() FROM PUBLIC;

-- Idempotent re-apply: drop any stale trigger before re-creating.
DROP TRIGGER IF EXISTS sync_user_profile_email_trigger ON auth.users;

CREATE TRIGGER sync_user_profile_email_trigger
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile_email();

COMMENT ON TRIGGER sync_user_profile_email_trigger ON auth.users IS
  'A-10: Fires after a confirmed email change to mirror the new value into user_profiles.email. See sync_user_profile_email() for behaviour.';
