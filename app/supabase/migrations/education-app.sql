-- =============================================================================
-- Baby Bloom Education App — Database Migration
-- =============================================================================
-- 6 tables: child_client, child_client_events, bapp_milestones, bapp_logs,
--           bapp_progress_scores, bapp_progress_history
-- Plus: RLS policies, helper function, indexes, triggers, seed data
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ensure updated_at trigger function exists (may already exist from core schema)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. child_client
-- =============================================================================
CREATE TABLE child_client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement_id UUID REFERENCES nanny_placements(id) ON DELETE SET NULL,
    nanny_user_id UUID NOT NULL REFERENCES auth.users(id),
    parent_user_id UUID REFERENCES auth.users(id),
    parent_lead_email TEXT,

    first_name TEXT,
    date_of_birth DATE,
    gender TEXT,
    age_months_approx INTEGER,

    under_three BOOLEAN NOT NULL DEFAULT false,
    onboarded BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'created_auto'
        CHECK (status IN ('created_auto', 'created_manual', 'setup', 'active_nanny', 'trial', 'trial_ended', 'active', 'closed')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_client_nanny ON child_client(nanny_user_id) WHERE under_three = true;
CREATE INDEX idx_child_client_placement ON child_client(placement_id);
CREATE INDEX idx_child_client_parent_email ON child_client(parent_lead_email) WHERE parent_lead_email IS NOT NULL;

CREATE TRIGGER set_child_client_updated_at
    BEFORE UPDATE ON child_client
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 2. child_client_events
-- =============================================================================
CREATE TABLE child_client_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL UNIQUE REFERENCES child_client(id) ON DELETE CASCADE,

    created_auto_at TIMESTAMPTZ,
    created_manual_at TIMESTAMPTZ,
    setup_at TIMESTAMPTZ,
    active_nanny_at TIMESTAMPTZ,
    trial_at TIMESTAMPTZ,
    trial_ended_at TIMESTAMPTZ,
    active_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);


-- =============================================================================
-- 3. bapp_milestones
-- =============================================================================
CREATE TABLE bapp_milestones (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    age_bracket TEXT NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 4. bapp_logs
-- =============================================================================
CREATE TABLE bapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    type TEXT NOT NULL CHECK (type IN ('activity', 'report', 'progress', 'observation', 'diary', 'insight')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'ready', 'completed')),
    context TEXT NOT NULL DEFAULT 'adhoc' CHECK (context IN ('adhoc', 'activity', 'assessment')),
    parent_log_id UUID REFERENCES bapp_logs(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed query: all logs for a child, sorted by time
CREATE INDEX idx_bapp_logs_child ON bapp_logs(child_client_id, created_at DESC);
-- Report cascade: find children of a parent log
CREATE INDEX idx_bapp_logs_parent ON bapp_logs(parent_log_id) WHERE parent_log_id IS NOT NULL;
-- Type-specific queries
CREATE INDEX idx_bapp_logs_type ON bapp_logs(child_client_id, type);
-- Smart polling: find pending activities
CREATE INDEX idx_bapp_logs_pending ON bapp_logs(child_client_id) WHERE status = 'pending';

CREATE TRIGGER set_bapp_logs_updated_at
    BEFORE UPDATE ON bapp_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 5. bapp_progress_scores
-- =============================================================================
CREATE TABLE bapp_progress_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    scores JSONB NOT NULL DEFAULT '{}',
    percent NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_client_id, domain)
);

CREATE TRIGGER set_bapp_progress_scores_updated_at
    BEFORE UPDATE ON bapp_progress_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 6. bapp_progress_history
-- =============================================================================
CREATE TABLE bapp_progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    ref_log_id UUID REFERENCES bapp_logs(id) ON DELETE SET NULL,
    cl_total INTEGER DEFAULT 0,
    pse_total INTEGER DEFAULT 0,
    pd_total INTEGER DEFAULT 0,
    lit_total INTEGER DEFAULT 0,
    num_total INTEGER DEFAULT 0,
    uw_total INTEGER DEFAULT 0,
    ead_total INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 7. RLS Helper Function
-- =============================================================================
CREATE OR REPLACE FUNCTION user_has_child_access(child_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM child_client cc
        WHERE cc.id = child_uuid
        AND (
            -- Direct nanny ownership (works before placement exists)
            cc.nanny_user_id = auth.uid()
            OR
            -- Placement-based access (works for both nanny and parent)
            EXISTS (
                SELECT 1 FROM nanny_placements np
                WHERE np.id = cc.placement_id
                AND np.status = 'active'
                AND (
                    np.nanny_id IN (SELECT n.id FROM nannies n WHERE n.user_id = auth.uid())
                    OR
                    np.parent_id IN (SELECT p.id FROM parents p WHERE p.user_id = auth.uid())
                )
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- 8. RLS Policies
-- =============================================================================

-- child_client
ALTER TABLE child_client ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nanny_access" ON child_client
    FOR ALL
    USING (nanny_user_id = auth.uid())
    WITH CHECK (nanny_user_id = auth.uid());

CREATE POLICY "parent_access" ON child_client
    FOR SELECT
    USING (
        placement_id IN (
            SELECT np.id FROM nanny_placements np
            JOIN parents p ON p.id = np.parent_id
            WHERE p.user_id = auth.uid()
        )
    );

-- child_client_events
ALTER TABLE child_client_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_crud" ON child_client_events
    FOR ALL
    USING (user_has_child_access(child_client_id))
    WITH CHECK (user_has_child_access(child_client_id));

-- bapp_milestones (read-only for all authenticated users)
ALTER TABLE bapp_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON bapp_milestones
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- bapp_logs
ALTER TABLE bapp_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_crud" ON bapp_logs
    FOR ALL
    USING (user_has_child_access(child_client_id))
    WITH CHECK (user_has_child_access(child_client_id));

-- bapp_progress_scores
ALTER TABLE bapp_progress_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_crud" ON bapp_progress_scores
    FOR ALL
    USING (user_has_child_access(child_client_id))
    WITH CHECK (user_has_child_access(child_client_id));

-- bapp_progress_history
ALTER TABLE bapp_progress_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_crud" ON bapp_progress_history
    FOR ALL
    USING (user_has_child_access(child_client_id))
    WITH CHECK (user_has_child_access(child_client_id));


-- =============================================================================
-- 9. Seed Milestones (41 milestones from prototype library.js)
-- =============================================================================

INSERT INTO bapp_milestones (id, domain, age_bracket, description, sort_order) VALUES
-- Communication & Language (CL)
('CL-03-A',    'CL',  '0-3 months',   'Expresses needs through cries',              1),
('CL-03-B',    'CL',  '0-3 months',   'Makes throaty noises when content',           2),
('CL-03-C',    'CL',  '0-3 months',   'Soothed by familiar voices',                  3),
('CL-2432-D',  'CL',  '24-32 months', 'Uses plurals/past tense',                     4),

-- Personal, Social & Emotional (PSE)
('PSE-03-A',   'PSE', '0-3 months',   'Smiles at people',                            5),
('PSE-03-B',   'PSE', '0-3 months',   'Makes eye contact',                           6),
('PSE-03-C',   'PSE', '0-3 months',   'Startles at loud noises',                     7),
('PSE-1218-C', 'PSE', '12-18 months', 'Has tantrums when frustrated',                8),
('PSE-2432-C', 'PSE', '24-32 months', 'Asserts independence (eg: ''I do it!'')',      9),
('PSE-2432-D', 'PSE', '24-32 months', 'Has imaginary friends/pretend play',          10),

-- Physical Development (PD)
('PD-03-A',    'PD',  '0-3 months',   'Lifts head and chest when on stomach',        11),
('PD-03-B',    'PD',  '0-3 months',   'Moves arms and legs actively',                12),
('PD-03-C',    'PD',  '0-3 months',   'Grasps finger when placed in palm',           13),
('PD-2432-C',  'PD',  '24-32 months', 'Climbs playground equipment',                 14),
('PD-2432-D',  'PD',  '24-32 months', 'Pedals tricycle',                             15),

-- Literacy (LIT)
('LIT-03-A',   'LIT', '0-3 months',   'Listens to voices and sounds',                16),
('LIT-03-B',   'LIT', '0-3 months',   'Recognizes familiar voices',                  17),
('LIT-03-C',   'LIT', '0-3 months',   'Enjoys simple songs/rhymes',                  18),
('LIT-2432-B', 'LIT', '24-32 months', 'Scribbles own name with help',                19),
('LIT-2432-C', 'LIT', '24-32 months', 'Sits through longer stories',                 20),
('LIT-2432-D', 'LIT', '24-32 months', 'Understands print has meaning',               21),

-- Numeracy (NUM)
('NUM-03-A',   'NUM', '0-3 months',   'Notices patterns and routines (e.g., feeding times)', 22),
('NUM-03-B',   'NUM', '0-3 months',   'Recognizes faces and objects',                 23),
('NUM-03-C',   'NUM', '0-3 months',   'Responds to number songs (rhythm)',            24),
('NUM-612-D',  'NUM', '6-12 months',  'Explores nesting toys/shape sorters',          25),
('NUM-2432-C', 'NUM', '24-32 months', 'Understands size/weight/length',               26),
('NUM-2432-D', 'NUM', '24-32 months', 'Uses number words in context',                 27),

-- Understanding the World (UW)
('UW-03-A',    'UW',  '0-3 months',   'Alert to faces and voices',                   28),
('UW-03-B',    'UW',  '0-3 months',   'Follows objects with eyes',                   29),
('UW-03-C',    'UW',  '0-3 months',   'Reaches for dangling objects',                30),
('UW-36-D',    'UW',  '3-6 months',   'May imitate simple actions',                  31),
('UW-1824-A',  'UW',  '18-24 months', 'Pretends to be someone else',                 32),
('UW-2432-C',  'UW',  '24-32 months', 'Shows interest in nature',                    33),
('UW-2432-D',  'UW',  '24-32 months', 'Follows three-step instructions',             34),

-- Expressive Arts & Design (EAD)
('EAD-03-A',   'EAD', '0-3 months',   'Coos as early musical expression',            35),
('EAD-03-B',   'EAD', '0-3 months',   'Moves arms/legs rhythmically',                36),
('EAD-03-C',   'EAD', '0-3 months',   'Shows pleasure in sounds',                    37),
('EAD-1218-B', 'EAD', '12-18 months', 'Plays with playdough/clay',                   38),
('EAD-1824-D', 'EAD', '18-24 months', 'Sings songs, may create own',                 39),
('EAD-2432-C', 'EAD', '24-32 months', 'Sings songs with actions',                    40),
('EAD-2432-D', 'EAD', '24-32 months', 'Enjoys role-playing/dressing up',             41);
