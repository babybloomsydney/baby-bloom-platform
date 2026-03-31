-- ═══════════════════════════════════════════════════════════════
-- Migration: Verification Sync Cleanup (Phase 2)
-- Date: 2026-03-31
-- Purpose: Remove harmful OCG trigger, fix WWCC expiry cron,
--          add UNIQUE constraint on verifications.user_id
-- Depends on: Phase 1 code changes (syncNannyVerificationState)
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- STEP 2.1: Drop trg_sync_nanny_from_ocg trigger (BUG-005)
-- ───────────────────────────────────────────────────────────────
-- This trigger has BUG-005: CLEARED branch blindly sets
-- identity_verified=TRUE, bypassing the identity verification
-- check entirely. It also creates a race condition with the OCG
-- webhook handler (both update nannies simultaneously).
-- With syncNannyVerificationState() handling all nannies sync
-- from the webhook code path, this trigger is redundant and harmful.

DROP TRIGGER IF EXISTS trg_sync_nanny_from_ocg ON verifications;
DROP FUNCTION IF EXISTS sync_nanny_from_ocg_result();


-- ───────────────────────────────────────────────────────────────
-- STEP 2.2: Fix check_wwcc_expiry() daily cron
-- ───────────────────────────────────────────────────────────────
-- Fixes in this version:
--   1. Adds wwcc_status_at = NOW() to verifications update
--      (was missing — sync function and UI rely on this timestamp)
--   2. Uses LEAST(verification_level, 2) instead of hardcoded
--      verification_level = 2 on nannies (was wrong if identity
--      wasn't verified — level 0 or 1 would be promoted to 2)
--   3. Fixes activity_logs column names: action → action_type,
--      details → action_details (original had wrong column names
--      which would cause the INSERT to fail silently)

CREATE OR REPLACE FUNCTION check_wwcc_expiry()
RETURNS void AS $$
DECLARE
  expired_record RECORD;
BEGIN
  -- Find nannies with expired WWCC (check both OCG and document expiry dates)
  FOR expired_record IN
    SELECT v.id AS verification_id, v.user_id,
           COALESCE(v.ocg_expiry_date, v.wwcc_expiry_date) AS effective_expiry
    FROM verifications v
    JOIN nannies n ON n.user_id = v.user_id
    WHERE n.wwcc_verified = TRUE
      AND COALESCE(v.ocg_expiry_date, v.wwcc_expiry_date) <= CURRENT_DATE
  LOOP
    -- Update verifications FIRST (source of truth)
    UPDATE verifications SET
      verification_status = 23,  -- WWCC_EXPIRED
      wwcc_status = 'expired',
      wwcc_verified = FALSE,
      wwcc_status_at = NOW(),
      updated_at = NOW()
    WHERE id = expired_record.verification_id;

    -- Update nannies cache
    -- LEAST caps level at 2 (ID_VERIFIED) — correct for levels 3/4
    -- which require WWCC. Levels 0/1 are already <= 2 so unchanged.
    UPDATE nannies SET
      wwcc_verified = FALSE,
      verification_level = LEAST(verification_level, 2),
      updated_at = NOW()
    WHERE user_id = expired_record.user_id;

    -- Audit log
    INSERT INTO activity_logs (user_id, action_type, action_details, created_at)
    VALUES (
      expired_record.user_id,
      'wwcc_expired',
      jsonb_build_object(
        'verification_id', expired_record.verification_id,
        'expiry_date', expired_record.effective_expiry,
        'source', CASE
          WHEN (SELECT ocg_expiry_date FROM verifications WHERE id = expired_record.verification_id) IS NOT NULL
          THEN 'ocg_authoritative'
          ELSE 'document_extracted'
        END
      ),
      NOW()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ───────────────────────────────────────────────────────────────
-- STEP 2.3: Add UNIQUE constraint on verifications.user_id
-- ───────────────────────────────────────────────────────────────
-- All code assumes one verification record per user (uses
-- .single() or .maybeSingle()). This enforces it at DB level.
--
-- IMPORTANT: Run the duplicate check query FIRST before applying:
--   SELECT user_id, COUNT(*)
--   FROM verifications
--   GROUP BY user_id
--   HAVING COUNT(*) > 1;
--
-- If duplicates exist, resolve them manually before running this.

ALTER TABLE verifications
  ADD CONSTRAINT unique_verifications_user_id UNIQUE (user_id);


-- ═══════════════════════════════════════════════════════════════
-- DOWN MIGRATION (reference only — do not run in production)
-- ═══════════════════════════════════════════════════════════════
-- To revert Step 2.3:
--   ALTER TABLE verifications DROP CONSTRAINT IF EXISTS unique_verifications_user_id;
--
-- To revert Step 2.2 (restore previous version):
--   Re-run the CREATE OR REPLACE from 20260224_add_ocg_audit_columns.sql Part 4
--
-- To revert Step 2.1 (restore trigger):
--   Re-run CREATE FUNCTION + CREATE TRIGGER from 20260224_add_ocg_audit_columns.sql Part 3
--   WARNING: This re-introduces BUG-005 (blind identity_verified=TRUE on CLEARED)
