-- ============================================================================
-- Katie / BloomBot — Foundation Migration (Phase 1 Sprint 1A)
-- ============================================================================
-- Adds all tables, functions, triggers, indexes, and RLS policies required
-- by Phase 1 (reactive Katie + read-only tools). Does NOT add Phase 3
-- training tables (katie_prompt_edits, katie_learnings, katie_proposals,
-- katie_templates, katie_tool_overrides, katie_manifest) — those land in
-- Phase 3A.
--
-- Prereqs (verified in prod as of 2026-04-23):
--   - education-app.sql deployed (bapp_logs, child_client, nanny_placements,
--     user_has_child_access() all exist)
--   - pgcrypto / gen_random_uuid() available (Supabase default)
--
-- Tables created:
--   1. bloombot                 — one AI bot per user
--   2. chat_messages            — persistent conversation history
--   3. agent_memory             — Katie's plain-text memory with envelope
--   4. chat_summaries           — compacted conversation summaries
--   5. chat_cost_daily          — daily cost tracking per bot
--   6. proactive_schedules      — Katie-created + system scheduled triggers
--   7. katie_prompt             — prompt-as-data (runtime source of truth)
--   8. katie_prompt_version     — singleton for cache invalidation hash
--
-- Functions created:
--   - is_admin_user()           — RLS helper (user_roles.role IN admin/super_admin)
--   - increment_chat_cost(...)  — atomic upsert for cost tracking
--   - bump_katie_prompt_version() — trigger body for cache invalidation
--
-- Modifications:
--   - bapp_logs: drop unnamed type CHECK, add named one with 'custom', add is_active
--
-- Rollback: companion file katie-foundation-rollback.sql
--
-- Apply via Supabase SQL Editor (dashboard) — whole file can be pasted.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Precondition checks — fail loudly if prereqs missing
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bapp_logs') THEN
    RAISE EXCEPTION 'bapp_logs does not exist — education-app.sql must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'child_client') THEN
    RAISE EXCEPTION 'child_client does not exist — education-app.sql must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'user_has_child_access') THEN
    RAISE EXCEPTION 'user_has_child_access() does not exist — education-app.sql must be applied first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_roles') THEN
    RAISE EXCEPTION 'user_roles does not exist — core schema must be applied first';
  END IF;
END$$;


-- ============================================================================
-- 1. is_admin_user() helper function
-- ============================================================================
-- Used by admin-gated RLS policies. Mirrors the TS helper isAdminRole().
-- SECURITY DEFINER + explicit search_path to prevent privilege escalation
-- via search_path hijacking.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_admin_user() IS
  'Returns true if the current authenticated user has admin or super_admin role. Used by RLS policies gated on admin access. Mirrors TS isAdminRole() helper.';


-- ============================================================================
-- 2. bloombot — one bot per user (Katie's persistent identity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bloombot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nanny', 'parent', 'admin')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bloombot_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.bloombot IS
  'One AI bot per user. The bot is Katie''s persistent identity in the chat system. All chat tables (messages, memory, summaries, costs, schedules) reference bloombot_id. Settings JSONB may include: waking_hours { start, end, timezone } — bounds for proactive delivery. effective_role (admin-only) — admin can present Katie as another role for testing (Option C from ADMIN-KATIE.md).';

CREATE INDEX IF NOT EXISTS idx_bloombot_user ON public.bloombot(user_id);

CREATE TRIGGER trg_bloombot_updated_at
  BEFORE UPDATE ON public.bloombot
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bloombot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_own_access" ON public.bloombot
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- 3. chat_messages — conversation history
-- ============================================================================
-- Supports reactive (user / assistant_reply) + proactive (3 tiers + manual).
-- Child reference is optional — account-level messages have NULL child.
-- Includes serverless-safe unread state for badge display.

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,
  child_client_id UUID REFERENCES public.child_client(id) ON DELETE SET NULL,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Proactive + unread support (see PROACTIVE-MESSAGES.md)
  trigger_source TEXT NOT NULL DEFAULT 'user' CHECK (trigger_source IN (
    'user',
    'assistant_reply',
    'proactive_module',
    'proactive_scheduled',
    'proactive_template',
    'proactive_manual'
  )),
  proactive_trigger_id TEXT,
  proactive_schedule_id UUID, -- FK added after proactive_schedules exists (below)
  is_read BOOLEAN NOT NULL DEFAULT true,

  -- Current-surface context captured at send time (for audit + analytics)
  surface_route TEXT,
  surface_feature TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.chat_messages.child_client_id IS
  'Set when the message is specifically about one child. NULL for account-level messages (profile, job search, etc.)';

COMMENT ON COLUMN public.chat_messages.is_read IS
  'Default true so user-typed + assistant-reply messages are already read. Only proactive_* messages insert with is_read=false to drive unread badge.';

CREATE INDEX IF NOT EXISTS idx_chat_messages_bot
  ON public.chat_messages(bloombot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_bot_recent
  ON public.chat_messages(bloombot_id, created_at DESC)
  WHERE role IN ('user', 'assistant');

CREATE INDEX IF NOT EXISTS idx_chat_messages_child
  ON public.chat_messages(child_client_id, created_at DESC)
  WHERE child_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON public.chat_messages(bloombot_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_chat_messages_proactive
  ON public.chat_messages(bloombot_id, proactive_trigger_id, created_at DESC)
  WHERE proactive_trigger_id IS NOT NULL;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_own_bot" ON public.chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = chat_messages.bloombot_id
      AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = chat_messages.bloombot_id
      AND b.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 4. agent_memory — Katie's plain-text memory with structured envelope
-- ============================================================================
-- Scope: account (about user, NULL child), child (single-bot child notes),
-- shared (cross-bot child facts — readable by any bot with child access).
-- See MEMORY-MODEL.md.

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,
  child_client_id UUID REFERENCES public.child_client(id) ON DELETE CASCADE,

  scope TEXT NOT NULL CHECK (scope IN ('account', 'child', 'shared')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  relevant_until DATE,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  content TEXT NOT NULL,

  source_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Scope invariants:
  --   account scope MUST have NULL child_client_id
  --   child/shared scope MUST have a child_client_id
  CONSTRAINT agent_memory_scope_child CHECK (
    (scope = 'account' AND child_client_id IS NULL) OR
    (scope IN ('child', 'shared') AND child_client_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.agent_memory IS
  'Katie''s plain-text memory. scope: account (NULL child) / child (private to this bot) / shared (cross-bot, visible to any bot with child access via user_has_child_access).';

CREATE INDEX IF NOT EXISTS idx_agent_memory_bot
  ON public.agent_memory(bloombot_id, scope, priority)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_agent_memory_child
  ON public.agent_memory(child_client_id, scope, priority)
  WHERE is_active = true AND child_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memory_tags
  ON public.agent_memory USING GIN (tags)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_agent_memory_relevance
  ON public.agent_memory(bloombot_id, relevant_until)
  WHERE is_active = true AND relevant_until IS NOT NULL;

CREATE TRIGGER trg_agent_memory_updated_at
  BEFORE UPDATE ON public.agent_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Split policies: own bot has full access; other bots can READ shared-scope
-- memories about children they also have access to.
CREATE POLICY "memory_own_bot" ON public.agent_memory
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = agent_memory.bloombot_id
      AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = agent_memory.bloombot_id
      AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "memory_shared_child_read" ON public.agent_memory
  FOR SELECT
  USING (
    scope = 'shared'
    AND child_client_id IS NOT NULL
    AND public.user_has_child_access(child_client_id)
  );


-- ============================================================================
-- 5. chat_summaries — compacted conversation summaries (daily/weekly/monthly)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,
  child_client_id UUID REFERENCES public.child_client(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  summary TEXT NOT NULL,
  key_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_summaries_unique UNIQUE (bloombot_id, child_client_id, period, date_start)
);

COMMENT ON TABLE public.chat_summaries IS
  'Rolled-up conversation summaries. Per bot, optionally per child. daily summaries roll up into weekly, weekly into monthly. NULL child means account-level summary.';

CREATE INDEX IF NOT EXISTS idx_chat_summaries_bot
  ON public.chat_summaries(bloombot_id, period, date_start DESC);

ALTER TABLE public.chat_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "summaries_own_bot" ON public.chat_summaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = chat_summaries.bloombot_id
      AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = chat_summaries.bloombot_id
      AND b.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 6. chat_cost_daily — daily cost tracking per bot
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_cost_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  proactive_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chat_cost_daily_unique UNIQUE (bloombot_id, date)
);

COMMENT ON TABLE public.chat_cost_daily IS
  'Daily cost aggregates per bot. Updated via increment_chat_cost() RPC to avoid race conditions. turn_count includes all assistant turns; proactive_count is a subset.';

CREATE INDEX IF NOT EXISTS idx_chat_cost_daily_date
  ON public.chat_cost_daily(bloombot_id, date DESC);

ALTER TABLE public.chat_cost_daily ENABLE ROW LEVEL SECURITY;

-- SELECT-only for users; writes go through increment_chat_cost() which uses
-- SECURITY DEFINER to bypass RLS.
CREATE POLICY "cost_own_bot_select" ON public.chat_cost_daily
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = chat_cost_daily.bloombot_id
      AND b.user_id = auth.uid()
    )
  );

-- Atomic upsert function — called from cost-tracker.ts after every AI turn.
CREATE OR REPLACE FUNCTION public.increment_chat_cost(
  p_bot_id UUID,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_cached_tokens INTEGER,
  p_cost NUMERIC,
  p_is_proactive BOOLEAN DEFAULT false
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chat_cost_daily (
    bloombot_id, date,
    input_tokens, output_tokens, cached_tokens,
    estimated_cost_usd, turn_count, proactive_count
  )
  VALUES (
    p_bot_id, CURRENT_DATE,
    p_input_tokens, p_output_tokens, p_cached_tokens,
    p_cost, 1, CASE WHEN p_is_proactive THEN 1 ELSE 0 END
  )
  ON CONFLICT (bloombot_id, date)
  DO UPDATE SET
    input_tokens       = chat_cost_daily.input_tokens       + EXCLUDED.input_tokens,
    output_tokens      = chat_cost_daily.output_tokens      + EXCLUDED.output_tokens,
    cached_tokens      = chat_cost_daily.cached_tokens      + EXCLUDED.cached_tokens,
    estimated_cost_usd = chat_cost_daily.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
    turn_count         = chat_cost_daily.turn_count         + 1,
    proactive_count    = chat_cost_daily.proactive_count    + EXCLUDED.proactive_count;
END;
$$;


-- ============================================================================
-- 7. proactive_schedules — cron-based + Katie-created proactive triggers
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.proactive_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloombot_id UUID NOT NULL REFERENCES public.bloombot(id) ON DELETE CASCADE,
  child_client_id UUID REFERENCES public.child_client(id) ON DELETE CASCADE,

  trigger_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('module', 'katie', 'admin')),

  -- Timing — exactly one of cron_expr or one_time_at
  cron_expr TEXT,
  one_time_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,

  -- Content generation
  mode TEXT NOT NULL CHECK (mode IN ('template', 'ai-minimal', 'ai-full')),
  template TEXT,
  prompt_fragment TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT proactive_schedules_timing CHECK (
    (cron_expr IS NOT NULL AND one_time_at IS NULL)
    OR (cron_expr IS NULL AND one_time_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.proactive_schedules IS
  'Cron-based + Katie-created proactive triggers. Scheduler runs every 15 min, picks up rows where next_run_at <= NOW() AND active = true. Katie creates rows via create_schedule tool. See PROACTIVE-MESSAGES.md.';

CREATE INDEX IF NOT EXISTS idx_proactive_schedules_due
  ON public.proactive_schedules(next_run_at)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_proactive_schedules_bot
  ON public.proactive_schedules(bloombot_id, active, next_run_at);

CREATE TRIGGER trg_proactive_schedules_updated_at
  BEFORE UPDATE ON public.proactive_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proactive_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_own_bot" ON public.proactive_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = proactive_schedules.bloombot_id
      AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bloombot b
      WHERE b.id = proactive_schedules.bloombot_id
      AND b.user_id = auth.uid()
    )
  );

-- Now that proactive_schedules exists, add the FK from chat_messages.
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_schedule_fk
  FOREIGN KEY (proactive_schedule_id)
  REFERENCES public.proactive_schedules(id)
  ON DELETE SET NULL;


-- ============================================================================
-- 8. katie_prompt + katie_prompt_version — prompt-as-data with cache hash
-- ============================================================================
-- The system prompt lives in the DB, not in code. Runtime loader reads
-- active rows and assembles the full prompt. A singleton katie_prompt_version
-- table holds a UUID hash that's bumped on every write via trigger — workers
-- check this hash each request (sub-5ms query) to know when to invalidate
-- their in-memory cache. Serverless-safe: no need to coordinate across workers.

CREATE TABLE IF NOT EXISTS public.katie_prompt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  -- Section IDs (extended during Phase 3):
  --   'identity', 'voice', 'boundaries', 'proactive_rules', 'logging_rules',
  --   'role_nanny', 'role_parent', 'role_admin',
  --   'scheduling_constraints',
  --   'module.<module_id>' — per-module fragments
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  protected BOOLEAN NOT NULL DEFAULT false,
  -- protected=true requires explicit second confirmation from admin Katie

  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  edit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT katie_prompt_section_version_unique UNIQUE (section, version)
);

COMMENT ON TABLE public.katie_prompt IS
  'Prompt-as-data. Runtime source of truth for Katie''s system prompt. Seeded from system/APP/BLOOMBOT/SYSTEM-PROMPT.md on first deploy via scripts/seed-katie-prompt.ts. Admin Katie can edit rows live (Phase 3). No RLS: server-side access only (service role).';

-- Exactly one active row per section at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_katie_prompt_active
  ON public.katie_prompt(section)
  WHERE is_active = true;

-- No RLS — this table is never accessed from the client.
-- Service-role-only via createAdminClient().
ALTER TABLE public.katie_prompt ENABLE ROW LEVEL SECURITY;
-- Deny-by-default: no policies means no role can read except service role.


-- Singleton version table for cache invalidation
CREATE TABLE IF NOT EXISTS public.katie_prompt_version (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version_hash UUID NOT NULL DEFAULT gen_random_uuid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.katie_prompt_version IS
  'Singleton row. Workers SELECT version_hash per request (sub-5ms) before using cached prompt sections. Any write to katie_prompt bumps this hash via trigger, so all workers see invalidation within one DB round-trip.';

-- Seed the initial row
INSERT INTO public.katie_prompt_version (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- Trigger function to bump version hash
CREATE OR REPLACE FUNCTION public.bump_katie_prompt_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.katie_prompt_version
  SET version_hash = gen_random_uuid(),
      updated_at = NOW()
  WHERE id = 1;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_katie_prompt_bump_version
  AFTER INSERT OR UPDATE OR DELETE ON public.katie_prompt
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.bump_katie_prompt_version();

ALTER TABLE public.katie_prompt_version ENABLE ROW LEVEL SECURITY;
-- Deny-by-default for the version table too. Loaders use service role.


-- ============================================================================
-- 9. bapp_logs modifications
-- ============================================================================
-- Add 'custom' to type enum (needed for Katie-created custom tiles).
-- Add is_active column (for soft-delete by delete_tile tool).

-- The existing CHECK constraint on bapp_logs.type is unnamed (defined inline
-- in education-app.sql). Look it up dynamically and drop it.
DO $$
DECLARE
  c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.bapp_logs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%type%activity%observation%diary%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bapp_logs DROP CONSTRAINT %I', c);
  END IF;
END$$;

ALTER TABLE public.bapp_logs
  ADD CONSTRAINT bapp_logs_type_check
  CHECK (type IN ('activity', 'report', 'progress', 'observation', 'diary', 'insight', 'custom'));

ALTER TABLE public.bapp_logs
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.bapp_logs.is_active IS
  'Soft-delete flag. Set to false by Katie''s delete_tile tool; row remains for audit. Feed queries must filter is_active = true (Phase 2 audit task).';

CREATE INDEX IF NOT EXISTS idx_bapp_logs_active
  ON public.bapp_logs(child_client_id, is_active, created_at DESC)
  WHERE is_active = true;


COMMIT;

-- ============================================================================
-- End of forward migration. See katie-foundation-rollback.sql for reversal.
-- ============================================================================
