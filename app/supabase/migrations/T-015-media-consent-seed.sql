-- ============================================================
-- T-015 — Media consent seed
--
-- 1. Adds `body_md TEXT` column to `legal_documents` so the
--    application can render policy text from Supabase (per
--    Bailey 2026-05-14 direction "policy table in Supabase").
--
-- 2. Seeds placeholder rows for the two bundled per-child
--    agreements (Bailey 2026-05-14 product call — see T-015
--    CONSENT-MODEL-DIVERGENCE-NOTE.md for divergence from T-014's
--    fragmented AGR-20/21..26 model):
--      - parent-app-consent  (covers app use + photos + sensitive info)
--      - nanny-attestation   (per-engagement professional ToS)
--
-- T-014 (Policies090526) will overwrite `body_md` with the
-- finalised legal text in a follow-up migration once policy text
-- is approved.
--
-- Idempotent: uses ON CONFLICT to allow re-running.
-- ============================================================

BEGIN;

-- 1. Schema change: body column on legal_documents.
ALTER TABLE legal_documents
  ADD COLUMN IF NOT EXISTS body_md TEXT;

COMMENT ON COLUMN legal_documents.body_md IS
  'Rendered policy markdown body. NULL until populated by the legal-content team. Read by PolicyContent component server-side.';

-- 2. Seed placeholder rows.
INSERT INTO legal_documents (
  document_id, version, effective_date, change_summary, body_md
) VALUES
  (
    'parent-app-consent',
    1,
    CURRENT_DATE,
    'PLACEHOLDER — body to be filled by T-014 (Policies090526).',
    '<!-- PLACEHOLDER: Parent photo + media consent policy text.\n'
    || 'This text is replaced by T-014 once the v2.1 amendments to '
    || 'Section 28 + JIT consent surface text for AGR-20 are approved. -->'
  ),
  (
    'nanny-attestation',
    1,
    CURRENT_DATE,
    'PLACEHOLDER — body to be filled by T-014.',
    '<!-- PLACEHOLDER: Nanny professional terms of service (annual). '
    || 'Replaced by T-014. -->'
  )
ON CONFLICT (document_id, version) DO NOTHING;

COMMIT;
