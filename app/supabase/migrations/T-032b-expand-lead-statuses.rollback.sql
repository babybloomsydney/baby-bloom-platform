-- T-032b ROLLBACK — revert expanded lead_status set back to the original 6.
--
-- Steps:
--   1. Move any rows currently using new statuses BACK to a value that's
--      valid under the old CHECK constraint. Lossy mapping:
--        called           → untouched     (no good fallback; least-bad)
--        texted           → untouched
--        emailed          → untouched
--        voicemail_left   → untouched
--        no_response      → unresponsive  (semantic round-trip)
--        replied          → responsive    (semantic round-trip)
--        booked           → in_conversation
--        activated        → in_conversation
--   2. Drop the new CHECK.
--   3. Restore the original CHECK.

BEGIN;

UPDATE nanny_contact_state SET lead_status = 'untouched'       WHERE lead_status IN ('called', 'texted', 'emailed', 'voicemail_left');
UPDATE nanny_contact_state SET lead_status = 'unresponsive'    WHERE lead_status = 'no_response';
UPDATE nanny_contact_state SET lead_status = 'responsive'      WHERE lead_status = 'replied';
UPDATE nanny_contact_state SET lead_status = 'in_conversation' WHERE lead_status IN ('booked', 'activated');

ALTER TABLE nanny_contact_state
  DROP CONSTRAINT IF EXISTS nanny_contact_state_lead_status_check;

ALTER TABLE nanny_contact_state
  ADD CONSTRAINT nanny_contact_state_lead_status_check
  CHECK (lead_status IN (
    'untouched',
    'in_conversation',
    'responsive',
    'unresponsive',
    'dormant',
    'do_not_contact'
  ));

COMMENT ON COLUMN nanny_contact_state.lead_status IS
  'Relationship pipeline state. Default untouched. Manual override always available. T-032.';

COMMIT;
