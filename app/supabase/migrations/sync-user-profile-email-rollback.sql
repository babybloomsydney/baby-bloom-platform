-- Rollback for sync-user-profile-email.sql

DROP TRIGGER IF EXISTS sync_user_profile_email_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.sync_user_profile_email();
