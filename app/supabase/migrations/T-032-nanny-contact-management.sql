-- =============================================================================
-- T-032 — Nanny Contact Management Page V1 (admin contact-state + log + notes)
-- =============================================================================
-- Adds an operator-managed contact-state surface on top of the existing
-- `nannies` table — no changes to `nannies` itself. Three new tables:
--
--   nanny_contact_state  One row per nanny, lazily created on first contact
--                        or operator action. Holds operator-only state:
--                        lead status (relationship pipeline), snooze /
--                        next-action date, pinned note, manual contact
--                        offset, responded-ever override, assigned operator.
--
--   lead_contacts        Append-mostly log of every contact attempt the
--                        operator records (call / sms / email / whatsapp /
--                        manual / etc.) with direction + outcome + purpose +
--                        operator handle. Editable for post-hoc outcome /
--                        note correction; created_at immutable.
--
--   lead_notes           One row per nanny, free-form markdown body, auto-
--                        save on blur from the drawer UI. Separate from
--                        contact log because notes evolve continuously;
--                        contacts are point-in-time events.
--
-- Triggers:
--   - `ensure_nanny_contact_state`     lazily upserts contact_state on first
--                                      lead_contacts INSERT, recording
--                                      last_contact_at = NEW.contacted_at.
--   - `recompute_last_contact`         recomputes contact_state.last_contact_at
--                                      as MAX over remaining log rows on
--                                      lead_contacts UPDATE / DELETE.
--   - `lead_contacts_touch_edit`       on BEFORE UPDATE: sets updated_at,
--                                      preserves original created_at, and
--                                      preserves edited_by if not provided.
--   - `touch_updated_at` (standard)    on BEFORE UPDATE for nanny_contact_state
--                                      + lead_notes: sets updated_at = now().
--
-- RLS: admin / super_admin only, via existing user_roles role gate.
--
-- Forward + rollback. See T-032-nanny-contact-management-rollback.sql.
-- Planning workspace:  /system/OUTREACH/NannyLeadManagement/
-- Data-model spec:     /system/OUTREACH/NannyLeadManagement/03-data-model.md
-- Operations task:     /system/OPERATIONS/ACTIVE/T-032-nanny-contact-management-v1/
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) nanny_contact_state — one row per nanny, lazily created
-- ----------------------------------------------------------------------------
-- Sparse: rows only exist for nannies whom the operator has touched (logged
-- a contact, snoozed, pinned a note, assigned an operator, etc.). Untouched
-- nannies LEFT JOIN to NULL → list query treats them as `lead_status = 'untouched'`
-- by default.
CREATE TABLE IF NOT EXISTS nanny_contact_state (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_user_id                   UUID        UNIQUE NOT NULL
                                                REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_status                     TEXT        NOT NULL DEFAULT 'untouched'
                                                CHECK (lead_status IN (
                                                  'untouched',
                                                  'in_conversation',
                                                  'responsive',
                                                  'unresponsive',
                                                  'dormant',
                                                  'do_not_contact'
                                                )),
  last_contact_at                 TIMESTAMPTZ,
  total_contacts_manual_offset    INTEGER     NOT NULL DEFAULT 0
                                                CHECK (total_contacts_manual_offset >= 0),
  responded_ever_override         BOOLEAN,
  next_action_at                  TIMESTAMPTZ,
  pinned_note                     TEXT,
  assigned_operator               TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nanny_contact_state IS
  'T-032 — operator-managed contact + relationship state per nanny. Sparse (one row per touched nanny). LEFT JOIN from nannies in the leads list query; untouched nannies treated as default lead_status=''untouched''.';

COMMENT ON COLUMN nanny_contact_state.lead_status IS
  'Relationship pipeline state. Default untouched. Manual override always available. T-032.';

COMMENT ON COLUMN nanny_contact_state.last_contact_at IS
  'Denormalised MAX(lead_contacts.contacted_at) for this nanny. Maintained by trigger. NULL means never contacted via this surface. T-032.';

COMMENT ON COLUMN nanny_contact_state.total_contacts_manual_offset IS
  'Operator-set backfill offset for contacts logged before this page existed. Displayed count = COUNT(lead_contacts) + this offset. T-032.';

COMMENT ON COLUMN nanny_contact_state.responded_ever_override IS
  'NULL = trust derived value (EXISTS inbound log). TRUE/FALSE = operator override. T-032.';

COMMENT ON COLUMN nanny_contact_state.next_action_at IS
  'Operator-set snooze / follow-up date. Drives worklist re-surfacing. T-032.';

COMMENT ON COLUMN nanny_contact_state.pinned_note IS
  'Single slot for a key insight that stays visible above the contact log. T-032.';

COMMENT ON COLUMN nanny_contact_state.assigned_operator IS
  'Operator handle assigned to this nanny (forward-compat for team routing; V1 = always Bailey). T-032.';

CREATE INDEX IF NOT EXISTS idx_nanny_contact_state_status
  ON nanny_contact_state(lead_status);

CREATE INDEX IF NOT EXISTS idx_nanny_contact_state_last_contact
  ON nanny_contact_state(last_contact_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_nanny_contact_state_next_action
  ON nanny_contact_state(next_action_at)
  WHERE next_action_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nanny_contact_state_assigned_operator
  ON nanny_contact_state(assigned_operator)
  WHERE assigned_operator IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) lead_contacts — append-mostly log of contact attempts
-- ----------------------------------------------------------------------------
-- Edits to outcome / note / purpose are allowed (operator corrects after a
-- call). created_at is immutable; updated_at + edited_by capture corrections.
CREATE TABLE IF NOT EXISTS lead_contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_user_id       UUID        NOT NULL
                                    REFERENCES auth.users(id) ON DELETE CASCADE,
  contacted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  method              TEXT        NOT NULL
                                    CHECK (method IN (
                                      'call', 'sms', 'email', 'whatsapp',
                                      'instagram', 'in_person', 'manual', 'other'
                                    )),
  direction           TEXT        NOT NULL
                                    CHECK (direction IN ('outbound', 'inbound')),
  outcome             TEXT
                                    CHECK (outcome IS NULL OR outcome IN (
                                      'answered', 'voicemail', 'no_answer',
                                      'replied', 'booked', 'not_interested',
                                      'bounced', 'pending'
                                    )),
  purpose             TEXT,
  note                TEXT,
  operator_handle     TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ,
  edited_by           TEXT
);

COMMENT ON TABLE lead_contacts IS
  'T-032 — append-mostly log of every operator-recorded contact attempt with a nanny. Editable for post-hoc outcome / note correction. created_at immutable; updates capture updated_at + edited_by.';

COMMENT ON COLUMN lead_contacts.method IS
  'Channel used. ''manual'' = operator backfilling a pre-page call without specifying channel. T-032.';

COMMENT ON COLUMN lead_contacts.direction IS
  'outbound = operator → nanny; inbound = nanny → operator. Drives responded_ever derivation. T-032.';

COMMENT ON COLUMN lead_contacts.outcome IS
  'Result of the contact. NULL or ''pending'' means awaiting the operator to fill in after the call. T-032.';

COMMENT ON COLUMN lead_contacts.purpose IS
  'Free-text campaign attribution. UI defaults: upsell-kids / verification-nudge / position-followup / general / other. Custom allowed. T-032.';

COMMENT ON COLUMN lead_contacts.operator_handle IS
  'Who logged this contact — session name, operator account, or human handle. Required for forensic traceability. T-032.';

CREATE INDEX IF NOT EXISTS idx_lead_contacts_nanny_user_id
  ON lead_contacts(nanny_user_id, contacted_at DESC);

-- (Note: a btree index on `purpose` was removed during the T-032 ECC review —
--  the fetcher does not filter on purpose server-side, so the index would only
--  add write overhead. Add back if/when a purpose-filtered query appears.)

-- Fast "responded_ever" derivation: does any inbound log row exist for this nanny?
CREATE INDEX IF NOT EXISTS idx_lead_contacts_inbound
  ON lead_contacts(nanny_user_id)
  WHERE direction = 'inbound';

-- ----------------------------------------------------------------------------
-- 3) lead_notes — one free-form markdown body per nanny
-- ----------------------------------------------------------------------------
-- Separate from contact log because notes evolve continuously; contacts are
-- point-in-time events. Upserted on auto-save (blur) from the drawer.
CREATE TABLE IF NOT EXISTS lead_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_user_id   UUID        UNIQUE NOT NULL
                                REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL DEFAULT '',
  last_edited_by  TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_notes IS
  'T-032 — free-form markdown notes per nanny. One row per nanny, upserted from the drawer notes textarea on auto-save (blur, debounced). Distinct from lead_contacts (which is event-shaped).';

-- ----------------------------------------------------------------------------
-- 4) Triggers
-- ----------------------------------------------------------------------------

-- 4a) Lazily create / upsert nanny_contact_state on first lead_contacts insert.
--     Also bump last_contact_at to MAX(existing, NEW.contacted_at) for the
--     case where back-dated logs land out of order.
CREATE OR REPLACE FUNCTION ensure_nanny_contact_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO nanny_contact_state (nanny_user_id, last_contact_at)
    VALUES (NEW.nanny_user_id, NEW.contacted_at)
  ON CONFLICT (nanny_user_id) DO UPDATE
    SET last_contact_at = GREATEST(
          COALESCE(nanny_contact_state.last_contact_at, NEW.contacted_at),
          NEW.contacted_at
        ),
        updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_nanny_contact_state IS
  'T-032 — lazily create nanny_contact_state row on first lead_contacts INSERT for a nanny. Idempotent via ON CONFLICT.';

DROP TRIGGER IF EXISTS trg_lead_contacts_after_insert ON lead_contacts;
CREATE TRIGGER trg_lead_contacts_after_insert
  AFTER INSERT ON lead_contacts
  FOR EACH ROW EXECUTE FUNCTION ensure_nanny_contact_state();

-- 4b) Recompute last_contact_at on UPDATE / DELETE. Covers contacted_at
--     edits (rare) + deletions (e.g. operator removing a mistaken log).
CREATE OR REPLACE FUNCTION recompute_last_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_nanny UUID;
  v_new_last     TIMESTAMPTZ;
BEGIN
  v_target_nanny := COALESCE(NEW.nanny_user_id, OLD.nanny_user_id);
  SELECT MAX(contacted_at) INTO v_new_last
    FROM lead_contacts
    WHERE nanny_user_id = v_target_nanny;

  UPDATE nanny_contact_state
    SET last_contact_at = v_new_last,
        updated_at      = now()
    WHERE nanny_user_id = v_target_nanny;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION recompute_last_contact IS
  'T-032 — recompute nanny_contact_state.last_contact_at after lead_contacts UPDATE / DELETE.';

-- WHEN guard: only re-compute last_contact_at when the timestamp or owner
-- changes. Routine outcome / note / purpose edits don't affect last_contact_at,
-- so skipping the MAX scan on those is a significant perf win.
DROP TRIGGER IF EXISTS trg_lead_contacts_after_update ON lead_contacts;
CREATE TRIGGER trg_lead_contacts_after_update
  AFTER UPDATE ON lead_contacts
  FOR EACH ROW
  WHEN (
    OLD.contacted_at  IS DISTINCT FROM NEW.contacted_at
 OR OLD.nanny_user_id IS DISTINCT FROM NEW.nanny_user_id
  )
  EXECUTE FUNCTION recompute_last_contact();

DROP TRIGGER IF EXISTS trg_lead_contacts_after_delete ON lead_contacts;
CREATE TRIGGER trg_lead_contacts_after_delete
  AFTER DELETE ON lead_contacts
  FOR EACH ROW EXECUTE FUNCTION recompute_last_contact();

-- 4c) BEFORE UPDATE on lead_contacts: keep created_at immutable, set
--     updated_at = now(), preserve edited_by if caller didn't set it.
--     SECURITY DEFINER + explicit search_path for consistency with the other
--     triggers in this migration; even though this BEFORE trigger only
--     mutates NEW (no cross-schema writes), the hardened pattern is preferred.
CREATE OR REPLACE FUNCTION lead_contacts_touch_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- created_at is immutable: revert any caller-side change.
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF NEW.edited_by IS NULL THEN
    NEW.edited_by := OLD.edited_by;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION lead_contacts_touch_edit IS
  'T-032 — BEFORE UPDATE on lead_contacts: enforce created_at immutability, set updated_at, preserve edited_by if caller did not provide.';

DROP TRIGGER IF EXISTS trg_lead_contacts_before_update ON lead_contacts;
CREATE TRIGGER trg_lead_contacts_before_update
  BEFORE UPDATE ON lead_contacts
  FOR EACH ROW EXECUTE FUNCTION lead_contacts_touch_edit();

-- 4d) Generic updated_at autotouch — used by nanny_contact_state + lead_notes.
--     SECURITY DEFINER + explicit search_path for consistency.
CREATE OR REPLACE FUNCTION t032_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION t032_touch_updated_at IS
  'T-032 — generic BEFORE UPDATE updated_at autotouch for nanny_contact_state + lead_notes. Scoped function name to avoid collision with existing project triggers.';

DROP TRIGGER IF EXISTS trg_nanny_contact_state_touch ON nanny_contact_state;
CREATE TRIGGER trg_nanny_contact_state_touch
  BEFORE UPDATE ON nanny_contact_state
  FOR EACH ROW EXECUTE FUNCTION t032_touch_updated_at();

DROP TRIGGER IF EXISTS trg_lead_notes_touch ON lead_notes;
CREATE TRIGGER trg_lead_notes_touch
  BEFORE UPDATE ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION t032_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 5) RLS — admin / super_admin only (mirror existing admin tables)
-- ----------------------------------------------------------------------------
ALTER TABLE nanny_contact_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes          ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin can do everything; everyone else sees nothing.
-- Server actions that use createAdminClient() (service-role) bypass RLS as
-- usual; user-session clients (which should not exist for this surface) get
-- denied by these policies.
DROP POLICY IF EXISTS admin_all_nanny_contact_state ON nanny_contact_state;
CREATE POLICY admin_all_nanny_contact_state ON nanny_contact_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS admin_all_lead_contacts ON lead_contacts;
CREATE POLICY admin_all_lead_contacts ON lead_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS admin_all_lead_notes ON lead_notes;
CREATE POLICY admin_all_lead_notes ON lead_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('admin', 'super_admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 6) Backfill — none required
-- ----------------------------------------------------------------------------
-- nanny_contact_state is sparse by design; rows materialise lazily on first
-- contact / operator action. Existing nannies appear in the list view via
-- LEFT JOIN with default `lead_status = 'untouched'` until touched.

COMMIT;
