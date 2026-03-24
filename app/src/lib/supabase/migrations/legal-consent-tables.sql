-- Legal Compliance Framework — Database Migration
-- Apply via Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Version: 1.0 | Date: 2026-03-23

-- ============================================================
-- 1. legal_documents — Document version tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS legal_documents (
  document_id TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content_hash TEXT,
  change_summary TEXT,
  requires_reacceptance BOOLEAN DEFAULT false,
  reacceptance_deadline DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id, version)
);

COMMENT ON TABLE legal_documents IS 'Tracks versions of all legal documents for consent audit trail.';

-- Seed initial document versions
INSERT INTO legal_documents (document_id, version, effective_date, content_hash, change_summary)
VALUES
  ('client-tos',         1, '2026-03-23', NULL, 'Initial version'),
  ('professional-tos',   1, '2026-03-23', NULL, 'Initial version'),
  ('privacy-policy',     1, '2026-03-23', NULL, 'Initial version'),
  ('biometric-notice',   1, '2026-03-23', NULL, 'Initial version'),
  ('code-of-conduct',    1, '2026-03-23', NULL, 'Initial version'),
  ('cookie-policy',      1, '2026-03-23', NULL, 'Initial version'),
  ('disclaimer',         1, '2026-03-23', NULL, 'Initial version')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. consent_records — Core consent event table (IMMUTABLE)
-- ============================================================
CREATE TABLE IF NOT EXISTS consent_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  user_type         TEXT CHECK (user_type IN ('client', 'professional')),
  agreement_id      TEXT NOT NULL,
  checkpoint_id     TEXT NOT NULL,
  checkpoint_text   TEXT NOT NULL,
  document_id       TEXT,
  document_version  INTEGER,
  consent_given     BOOLEAN NOT NULL DEFAULT true,
  ip_address        INET,
  user_agent        TEXT,
  session_id        TEXT,
  related_entity_id UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE consent_records IS 'Immutable, append-only consent event log. No UPDATE or DELETE allowed.';

CREATE INDEX idx_consent_records_user ON consent_records (user_id);
CREATE INDEX idx_consent_records_agreement ON consent_records (agreement_id);
CREATE INDEX idx_consent_records_entity ON consent_records (related_entity_id) WHERE related_entity_id IS NOT NULL;

-- RLS: INSERT only for authenticated, no UPDATE/DELETE, admin SELECT
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_insert_authenticated"
  ON consent_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "consent_select_own"
  ON consent_records FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Block UPDATE and DELETE via trigger (belt and suspenders with RLS)
CREATE OR REPLACE FUNCTION prevent_consent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'consent_records is immutable. UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_no_update
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION prevent_consent_modification();

CREATE TRIGGER consent_no_delete
  BEFORE DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION prevent_consent_modification();

-- ============================================================
-- 3. biometric_consent_records — Extended biometric consent
-- ============================================================
CREATE TABLE IF NOT EXISTS biometric_consent_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  notice_opened_at            TIMESTAMPTZ,
  notice_scroll_completed_at  TIMESTAMPTZ,
  notice_time_spent_seconds   INTEGER,
  checkboxes_enabled_at       TIMESTAMPTZ,
  checkbox_timestamps         JSONB,
  ai_provider_disclosed       TEXT DEFAULT 'OpenAI GPT-4o',
  processing_location_disclosed TEXT DEFAULT 'United States',
  notice_version              INTEGER DEFAULT 1,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE biometric_consent_records IS 'Extended biometric consent tracking with scroll and timing data.';

ALTER TABLE biometric_consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "biometric_insert_authenticated"
  ON biometric_consent_records FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "biometric_select_own"
  ON biometric_consent_records FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 4. cookie_consent_records — Cookie preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS cookie_consent_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id       TEXT NOT NULL,
  user_id          UUID REFERENCES auth.users ON DELETE SET NULL,
  consent_choice   TEXT CHECK (consent_choice IN ('accept_all', 'reject_non_essential', 'custom')),
  analytics_enabled BOOLEAN DEFAULT false,
  marketing_enabled BOOLEAN DEFAULT false,
  ip_address       INET,
  user_agent       TEXT,
  expiry_date      TIMESTAMPTZ,
  superseded_by    UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cookie_consent_records IS 'Cookie consent preferences for visitors and authenticated users.';

CREATE INDEX idx_cookie_consent_visitor ON cookie_consent_records (visitor_id);

ALTER TABLE cookie_consent_records ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts via API route (service role)
CREATE POLICY "cookie_insert_anon"
  ON cookie_consent_records FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================================
-- 5. email_delivery_audit — Hire email tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS email_delivery_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id           UUID,
  recipient_user_id UUID,
  recipient_email   TEXT,
  email_type        TEXT CHECK (email_type IN ('client_hire_confirmation', 'professional_hire_confirmation')),
  sent_at           TIMESTAMPTZ,
  delivery_status   TEXT DEFAULT 'sent',
  pdf_filename      TEXT,
  pdf_version       TEXT,
  pdf_content_hash  TEXT,
  retry_count       INTEGER DEFAULT 0,
  fallback_action   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_delivery_audit IS 'Audit trail for hire confirmation email deliveries and PDF attachments.';

ALTER TABLE email_delivery_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_audit_select_own"
  ON email_delivery_audit FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());
