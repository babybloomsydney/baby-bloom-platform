-- T-032b — Expand lead_status to include action-oriented operator states.
--
-- Original T-032 ships with 6 statuses (untouched, in_conversation, responsive,
-- unresponsive, dormant, do_not_contact). Bailey wants richer granularity from
-- phone-call workflow: called / texted / emailed / voicemail_left / no_response /
-- replied / booked / activated.
--
-- Renames (semantically equivalent, sharper terminology):
--   responsive   → replied
--   unresponsive → no_response
--
-- New tags added (no rename, additive):
--   called, texted, emailed, voicemail_left, booked, activated
--
-- Final allowed set (12 values):
--   untouched · called · texted · emailed · voicemail_left · no_response ·
--   replied · in_conversation · booked · activated · dormant · do_not_contact
--
-- Apply order (must run as one transaction):
--   1. UPDATE existing rows to the new names (responsive → replied,
--      unresponsive → no_response) so they remain valid after the CHECK swap.
--   2. DROP the old CHECK constraint.
--   3. ADD the new CHECK with the expanded list.
--
-- Rollback lives in T-032b-expand-lead-statuses.rollback.sql.

BEGIN;

-- 1. Rename existing rows to the new vocabulary
UPDATE nanny_contact_state
   SET lead_status = 'replied'
 WHERE lead_status = 'responsive';

UPDATE nanny_contact_state
   SET lead_status = 'no_response'
 WHERE lead_status = 'unresponsive';

-- 2. Drop the old CHECK
ALTER TABLE nanny_contact_state
  DROP CONSTRAINT IF EXISTS nanny_contact_state_lead_status_check;

-- 3. Add the new CHECK with the expanded list
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
  'Relationship pipeline state. Default untouched. Operator-managed. Expanded set (T-032b): adds called/texted/emailed/voicemail_left/booked/activated and renames responsive→replied, unresponsive→no_response.';

COMMIT;
