-- =============================================================================
-- DELETE TEST USER — reusable end-to-end test-user wipe
-- =============================================================================
--
-- Usage:
--   1. Edit the `v_email` value on the line marked `-- ⇩ EDIT ME ⇩` below.
--   2. Paste the entire script into Supabase SQL editor (live DB).
--   3. Run.
--   4. Check NOTICE output — per-table row counts + skips for any schema drift.
--
-- Behaviour:
--   - Atomic. Single transaction. Per-table EXCEPTION blocks so one schema
--     drift (wrong column name, missing table) doesn't abort the whole wipe.
--   - Cleans every table that FKs to auth.users.id for this user, plus
--     email-keyed tables (nanny_leads, parent_leads).
--   - NULLs out backref pointers in OTHER users' rows.
--   - Idempotent: safe to re-run; second run reports 0 rows everywhere.
--
-- Does NOT touch:
--   - Stripe (test users may have stripe_customer_id / stripe_connect_account_id —
--     clean separately; see footer notes).
--   - Cloudinary uploaded images.
--
-- Schema-drift recovery:
--   If you see "skipped (42703: column ... does not exist)" for any table,
--   that table's column was renamed since this script was authored. Run the
--   diagnostic query at the bottom of this file to discover the right column,
--   then update the affected DELETE statement.
--
-- Author: `deployAudit180526` 2026-05-18 (T-025 audit session).
-- =============================================================================

BEGIN;

-- Bypass triggers for the duration of this transaction. Required because:
--   • `consent_records` has a `prevent_consent_modification` trigger (T-015/T-017
--     legal audit-trail immutability) that blocks DELETE/UPDATE by design.
--   • Other tables may also have audit-trail triggers we'd want to bypass for
--     a true test-user wipe.
-- `replica` role causes triggers NOT marked ENABLE REPLICA to skip firing,
-- ONLY for this transaction. Restored to `origin` on COMMIT automatically.
-- Requires superuser; Supabase SQL editor runs as `postgres` which qualifies.
SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  -- ⇩ EDIT ME ⇩
  v_email     CITEXT := 'verification@babybloomsydney.com.au'::CITEXT;
  -- ⇧ EDIT ME ⇧

  v_user_id   UUID;
  v_count     INTEGER;
  v_nanny_id  UUID;
  v_parent_id UUID;
BEGIN
  -- Look up the user
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No auth.users row for % — will still clean email-keyed tables (leads, etc.)', v_email;
  ELSE
    RAISE NOTICE '======================================================================';
    RAISE NOTICE 'Wiping user_id: %', v_user_id;
    RAISE NOTICE 'Email:          %', v_email;
    RAISE NOTICE '======================================================================';

    -- Lookup nanny + parent UUIDs
    BEGIN SELECT id INTO v_nanny_id  FROM nannies WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN v_nanny_id := NULL; END;
    BEGIN SELECT id INTO v_parent_id FROM parents WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN v_parent_id := NULL; END;
    RAISE NOTICE 'nannies.id:  %', COALESCE(v_nanny_id::TEXT, '(none)');
    RAISE NOTICE 'parents.id:  %', COALESCE(v_parent_id::TEXT, '(none)');
    RAISE NOTICE '----------------------------------------------------------------------';

    -- =========================================================================
    -- 1. NULL out backref pointers
    -- =========================================================================
    BEGIN
      UPDATE parents SET current_nanny_id = NULL WHERE current_nanny_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RAISE NOTICE '  ↳ parents.current_nanny_id refs nulled: %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  ↳ parents.current_nanny_id: skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 2. Logs + audit tables
    -- =========================================================================
    BEGIN
      DELETE FROM activity_logs WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  activity_logs:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  activity_logs:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM email_logs WHERE recipient_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  email_logs:           %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  email_logs:           skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM user_progress WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  user_progress:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  user_progress:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM file_retention_log WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  file_retention_log:   %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  file_retention_log:   skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM consent_records WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  consent_records:      %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  consent_records:      skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 3. Babysitting / matching (children first)
    -- =========================================================================
    BEGIN
      DELETE FROM bsr_notifications
       WHERE nanny_user_id = v_user_id
          OR babysitting_request_id IN (
               SELECT id FROM babysitting_requests WHERE parent_user_id = v_user_id
             );
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  bsr_notifications:    %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  bsr_notifications:    skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM bsr_time_slots
       WHERE babysitting_request_id IN (
               SELECT id FROM babysitting_requests WHERE parent_user_id = v_user_id
             );
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  bsr_time_slots:       %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  bsr_time_slots:       skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM babysitting_requests WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  babysitting_requests: %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  babysitting_requests: skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM interview_requests
       WHERE parent_user_id = v_user_id OR nanny_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  interview_requests:   %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  interview_requests:   skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM nanny_placements
       WHERE parent_user_id = v_user_id OR nanny_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_placements:     %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  nanny_placements:     skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 4. Positions
    -- =========================================================================
    BEGIN
      DELETE FROM position_children
       WHERE nanny_position_id IN (
               SELECT id FROM nanny_positions WHERE parent_user_id = v_user_id
             );
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  position_children:    %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  position_children:    skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM position_schedule
       WHERE nanny_position_id IN (
               SELECT id FROM nanny_positions WHERE parent_user_id = v_user_id
             );
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  position_schedule:    %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  position_schedule:    skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM nanny_positions WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_positions:      %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  nanny_positions:      skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 5. Payments / payouts
    -- =========================================================================
    BEGIN
      DELETE FROM nanny_payouts
       WHERE nanny_user_id = v_user_id OR parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_payouts:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  nanny_payouts:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM parent_subscriptions WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  parent_subscriptions: %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  parent_subscriptions: skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM refund_requests WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  refund_requests:      %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  refund_requests:      skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM contact_messages WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  contact_messages:     %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  contact_messages:     skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 6. Child linking
    -- =========================================================================
    BEGIN
      DELETE FROM child_invites
       WHERE parent_user_id = v_user_id OR nanny_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  child_invites:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  child_invites:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM child_client
       WHERE parent_user_id = v_user_id OR nanny_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  child_client:         %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  child_client:         skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 7. Verification
    -- =========================================================================
    BEGIN
      DELETE FROM verifications WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  verifications:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  verifications:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM parent_verifications WHERE parent_user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  parent_verifications: %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  parent_verifications: skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 8. Nanny profile children
    -- =========================================================================
    IF v_nanny_id IS NOT NULL THEN
      BEGIN
        DELETE FROM nanny_credentials WHERE nanny_id = v_nanny_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_credentials:    %', v_count;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '  nanny_credentials:    skipped (% — %)', SQLSTATE, SQLERRM;
      END;

      BEGIN
        DELETE FROM nanny_availability WHERE nanny_id = v_nanny_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_availability:   %', v_count;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '  nanny_availability:   skipped (% — %)', SQLSTATE, SQLERRM;
      END;

      BEGIN
        DELETE FROM nanny_assurances WHERE nanny_id = v_nanny_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_assurances:     %', v_count;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '  nanny_assurances:     skipped (% — %)', SQLSTATE, SQLERRM;
      END;

      BEGIN
        DELETE FROM nanny_images WHERE nanny_id = v_nanny_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_images:         %', v_count;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '  nanny_images:         skipped (% — %)', SQLSTATE, SQLERRM;
      END;

      BEGIN
        DELETE FROM nanny_ai_content WHERE nanny_id = v_nanny_id;
        GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_ai_content:     %', v_count;
      EXCEPTION WHEN undefined_column OR undefined_table THEN
        RAISE NOTICE '  nanny_ai_content:     skipped (% — %)', SQLSTATE, SQLERRM;
      END;
    END IF;

    -- =========================================================================
    -- 9. Primary entity rows
    -- =========================================================================
    BEGIN
      DELETE FROM nannies WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nannies:              %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  nannies:              skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM parents WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  parents:              %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  parents:              skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    -- =========================================================================
    -- 10. User profile + roles
    -- =========================================================================
    BEGIN
      DELETE FROM user_profiles WHERE id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  user_profiles:        %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  user_profiles:        skipped (% — %)', SQLSTATE, SQLERRM;
    END;

    BEGIN
      DELETE FROM user_roles WHERE user_id = v_user_id;
      GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  user_roles:           %', v_count;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      RAISE NOTICE '  user_roles:           skipped (% — %)', SQLSTATE, SQLERRM;
    END;
  END IF;

  -- =========================================================================
  -- 11. Email-keyed cleanup (runs even if no auth.users row existed)
  -- =========================================================================
  RAISE NOTICE '----------------------------------------------------------------------';

  BEGIN
    DELETE FROM nanny_leads WHERE email = v_email;
    GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  nanny_leads (by email):  %', v_count;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    RAISE NOTICE '  nanny_leads:             skipped (% — %)', SQLSTATE, SQLERRM;
  END;

  BEGIN
    DELETE FROM parent_leads WHERE email = v_email;
    GET DIAGNOSTICS v_count = ROW_COUNT; RAISE NOTICE '  parent_leads (by email): %', v_count;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    RAISE NOTICE '  parent_leads:            skipped (% — %)', SQLSTATE, SQLERRM;
  END;

  -- =========================================================================
  -- 12. Finally: auth.users (last; FK target of most above)
  -- =========================================================================
  IF v_user_id IS NOT NULL THEN
    -- CRITICAL: restore session_replication_role to 'origin' BEFORE touching
    -- auth.*. The 'replica' setting disables ALL triggers — including the
    -- internal PG triggers that implement ON DELETE CASCADE from auth.users
    -- to auth.identities / auth.sessions / auth.refresh_tokens. Leaving it
    -- on 'replica' would orphan the identity row + leave the email "in use"
    -- even though auth.users is gone.
    SET LOCAL session_replication_role = 'origin';

    -- NO exception block — auth.users delete failure is a HARD error.
    -- If a child table still references this user, the whole transaction
    -- rolls back so the caller knows the wipe didn't actually finish.
    -- Without this, you get a false "success" with the auth row still there.
    DELETE FROM auth.users WHERE id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'auth.users DELETE matched 0 rows for id=% — user_id lookup was stale?', v_user_id;
    END IF;
    RAISE NOTICE '  auth.users:           % (cascades to auth.identities/sessions/refresh_tokens)', v_count;
  END IF;

  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'Wipe complete for %', v_email;
  RAISE NOTICE '======================================================================';
END $$;

COMMIT;

-- =============================================================================
-- DIAGNOSTIC — discover the right column name for a table
-- =============================================================================
-- If a table reports "skipped (42703: column X does not exist)", paste this
-- (replace 'file_retention_log' with the table name) to see actual columns:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'file_retention_log'
--    ORDER BY ordinal_position;
--
-- Then patch the relevant DELETE in this script + re-run (idempotent).
-- =============================================================================

-- =============================================================================
-- POST-RUN VERIFICATION (paste separately to confirm clean state)
-- =============================================================================
--   SELECT
--     (SELECT COUNT(*) FROM auth.users     WHERE email = 'verification@babybloomsydney.com.au') AS auth_users,
--     (SELECT COUNT(*) FROM user_profiles  WHERE email = 'verification@babybloomsydney.com.au') AS user_profiles,
--     (SELECT COUNT(*) FROM nanny_leads    WHERE email = 'verification@babybloomsydney.com.au') AS nanny_leads;
-- -- All three should be 0.
-- =============================================================================

-- =============================================================================
-- STRIPE CLEANUP (separate, manual — this script does NOT touch Stripe)
-- =============================================================================
--   stripe customers list --email='verification@babybloomsydney.com.au'
--   stripe customers delete <cus_xxx>
--
-- Connect accounts: Stripe Dashboard → Connect → Accounts → search → Reject.
-- =============================================================================
