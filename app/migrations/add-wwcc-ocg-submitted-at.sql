-- Migration: Add wwcc_ocg_submitted_at column to verifications table
-- Purpose: Track when admin submitted WWCC to OCG portal (tracking-only, no verification state change)
-- Run this BEFORE deploying code changes
-- STATUS: APPLIED to production on 9 April 2026

ALTER TABLE verifications ADD COLUMN IF NOT EXISTS wwcc_ocg_submitted_at TIMESTAMPTZ;
