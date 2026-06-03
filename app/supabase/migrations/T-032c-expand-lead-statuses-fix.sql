-- T-032c — Corrected order for the lead_status expansion.
--
-- T-032b's original ordering ran UPDATE before swapping the CHECK
-- constraint, so the OLD CHECK rejected `replied` / `no_response`
-- and the whole transaction rolled back.
--
-- Correct order:
--   1. DROP the old CHECK (so any value is allowed momentarily)
--   2. UPDATE existing rows to the new vocabulary
--   3. ADD the new CHECK with the expanded set
--
-- Idempotent: safe to re-run. If T-032b already partially applied,
-- this leaves the table in the correct final state.

BEGIN;

-- 1. Drop the old CHECK first
ALTER TABLE nanny_contact_state
  DROP CONSTRAINT IF EXISTS nanny_contact_state_lead_status_check;

-- 2. Rename existing rows to the new vocabulary
UPDATE nanny_contact_state
   SET lead_status = 'replied'
 WHERE lead_status = 'responsive';

UPDATE nanny_contact_state
   SET lead_status = 'no_response'
 WHERE lead_status = 'unresponsive';

-- 3. Add the new CHECK with the expanded set
ALTER TABLE nanny_contact_state
  ADD CONSTRAINT nanny_contact_state_lead_status_check
  CHECK (lead_status IN (
    'untouched',
    'called',
    'texted',
    'emailed',
    'voicemail_left',
    'no_response',
    'replied',
    'in_conversation',
    'booked',
    'activated',
    'dormant',
    'do_not_contact'
  ));

COMMENT ON COLUMN nanny_contact_state.lead_status IS
  'Relationship pipeline state. Default untouched. Operator-managed. Expanded set (T-032b/c): adds called/texted/emailed/voicemail_left/booked/activated and renames responsive→replied, unresponsive→no_response.';

COMMIT;
