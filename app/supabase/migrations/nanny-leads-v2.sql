-- ============================================================
-- Nanny Leads V2 Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1A: Create nanny_leads table
-- ============================================================

CREATE TABLE nanny_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            CITEXT NOT NULL UNIQUE,
  phone            TEXT,
  identity         JSONB DEFAULT '{}',
  experience       JSONB DEFAULT '{}',
  qualifications   JSONB DEFAULT '{}',
  residency        JSONB DEFAULT '{}',
  preferences      JSONB DEFAULT '{}',
  availability     JSONB DEFAULT '{}',
  salary           JSONB DEFAULT '{}',
  matching         JSONB DEFAULT '{}',
  about_you        JSONB DEFAULT '{}',
  ai_bio           TEXT,
  ai_content       JSONB,
  lead_status      TEXT NOT NULL DEFAULT 'applied'
                   CHECK (lead_status IN ('applied','ai_generated','converted','abandoned','rejected')),
  funnel_step      TEXT DEFAULT 'N1',
  last_active_at   TIMESTAMPTZ DEFAULT NOW(),
  converted_at     TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nanny_leads_email ON nanny_leads(email);
CREATE INDEX idx_nanny_leads_status ON nanny_leads(lead_status);
CREATE INDEX idx_nanny_leads_auth_user ON nanny_leads(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_nanny_leads_created ON nanny_leads(created_at);
CREATE INDEX idx_nanny_leads_unconverted ON nanny_leads(last_active_at DESC) WHERE lead_status != 'converted';

CREATE TRIGGER trg_nanny_leads_updated_at
  BEFORE UPDATE ON nanny_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 1B: Add V2 columns to nannies
-- ============================================================

ALTER TABLE nannies ADD COLUMN IF NOT EXISTS motivation TEXT;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS personality_traits TEXT[];
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS professional_values TEXT[];
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS childcare_roles JSONB;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS photo_1_url TEXT;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS photo_2_url TEXT;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS photo_3_url TEXT;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS ai_bio TEXT;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE nannies ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- 1C: RLS for nanny_leads
-- ============================================================

ALTER TABLE nanny_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all leads" ON nanny_leads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin','super_admin')
  ));

-- 1D: Fix form_snapshots CHECK constraint
-- ============================================================

ALTER TABLE form_snapshots DROP CONSTRAINT IF EXISTS form_snapshots_form_type_check;
ALTER TABLE form_snapshots ADD CONSTRAINT form_snapshots_form_type_check
  CHECK (form_type IN ('nanny_registration','nanny_edit','parent_position','verification','nanny_lead_conversion'));
