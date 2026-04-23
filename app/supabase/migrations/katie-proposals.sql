-- ============================================================================
-- Migration: katie-proposals
-- Adds:
--   - katie_proposals   proposals filed by admin Katie for code / schema /
--                       prompt changes that require dev review
-- Depends on: katie-foundation.sql (bloombot)
-- Rollback: katie-proposals-rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.katie_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,

  -- Who filed it + what kind of change.
  proposed_by UUID NOT NULL REFERENCES auth.users(id),
  kind TEXT NOT NULL
    CHECK (kind IN ('module_change', 'schema_change', 'prompt_change', 'other')),

  -- Freeform target pointer, e.g. 'module:progress', 'table:bapp_logs',
  -- 'section:identity'. App code parses this on read.
  target TEXT NOT NULL,

  summary TEXT NOT NULL,
  details TEXT,
  suggested_diff TEXT,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'rejected', 'implemented')),
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.katie_proposals IS
  'Proposals filed by admin Katie (via propose_module_change / propose_schema_change) for dev review. Distinct from katie_prompt_edits (applied directly). Proposals need human approval before they ship — dev picks them up from the admin queue page.';

CREATE INDEX IF NOT EXISTS idx_katie_proposals_status
  ON public.katie_proposals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_katie_proposals_target
  ON public.katie_proposals(target);

CREATE INDEX IF NOT EXISTS idx_katie_proposals_proposed_by
  ON public.katie_proposals(proposed_by, created_at DESC);

CREATE TRIGGER trg_katie_proposals_updated_at
  BEFORE UPDATE ON public.katie_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.katie_proposals ENABLE ROW LEVEL SECURITY;

-- Admins can CRUD proposals they filed; super_admins can CRUD any proposal
-- (they're the reviewers).
CREATE POLICY "proposals_admin_own" ON public.katie_proposals
  FOR ALL
  USING (
    proposed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    proposed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "proposals_super_admin_all" ON public.katie_proposals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
    )
  );
