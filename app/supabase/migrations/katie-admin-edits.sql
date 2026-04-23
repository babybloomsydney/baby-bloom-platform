-- ============================================================================
-- Migration: katie-admin-edits
-- Adds:
--   - katie_prompt_edits   audit log of every applied prompt edit
-- Depends on: katie-foundation.sql (bloombot, katie_prompt)
-- Rollback: katie-admin-edits-rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.katie_prompt_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,

  section TEXT NOT NULL,
  before_content TEXT NOT NULL,
  after_content TEXT NOT NULL,
  before_version INTEGER NOT NULL,
  after_version INTEGER NOT NULL,

  -- Diff is computed in-app (simple unified format) and stored here so an
  -- ops user can scan applied_edits without re-diffing.
  diff TEXT,

  -- Why the edit was made — Katie's rationale or the admin's note.
  reason TEXT,

  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'rolled_back')),

  -- Chain: when this edit itself has been rolled back, points to the edit
  -- that rolled it back (so we can reconstruct the history).
  rolled_back_by_edit_id UUID REFERENCES public.katie_prompt_edits(id),

  applied_by UUID NOT NULL REFERENCES auth.users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.katie_prompt_edits IS
  'Audit log for admin-applied prompt edits. Every apply_prompt_edit and rollback_prompt_edit call inserts one row. Retains both before_content and after_content verbatim so rollback is trivial.';

CREATE INDEX IF NOT EXISTS idx_katie_prompt_edits_section
  ON public.katie_prompt_edits(section, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_katie_prompt_edits_applied_by
  ON public.katie_prompt_edits(applied_by, applied_at DESC);

ALTER TABLE public.katie_prompt_edits ENABLE ROW LEVEL SECURITY;

-- Admins can read and insert their own edits; the app performs admin-only
-- access via the service-role client, so RLS here is defence-in-depth.
CREATE POLICY "edits_admin_own" ON public.katie_prompt_edits
  FOR ALL
  USING (
    applied_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    applied_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  );
