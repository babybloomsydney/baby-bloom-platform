-- ============================================================================
-- Katie / BloomBot — Foundation Migration Rollback
-- ============================================================================
-- Fully reverses katie-foundation.sql. Drops all new tables, functions,
-- triggers, constraints. Restores bapp_logs to its pre-Katie state.
--
-- Safe to run even if no Katie data exists yet (CASCADE + IF EXISTS
-- guards throughout).
--
-- Order matters: drop in reverse dependency order.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Revert bapp_logs modifications (most surgical — touches existing table)
-- ----------------------------------------------------------------------------

-- Drop named CHECK constraint + restore inline (unnamed) version matching
-- the original education-app.sql shape.
ALTER TABLE public.bapp_logs
  DROP CONSTRAINT IF EXISTS bapp_logs_type_check;

-- Restore original unnamed CHECK (PG auto-names it bapp_logs_type_check
-- again, but without 'custom' — matching pre-Katie state).
ALTER TABLE public.bapp_logs
  ADD CHECK (type IN ('activity', 'report', 'progress', 'observation', 'diary', 'insight'));

DROP INDEX IF EXISTS public.idx_bapp_logs_active;

ALTER TABLE public.bapp_logs
  DROP COLUMN IF EXISTS is_active;

-- ----------------------------------------------------------------------------
-- 2. Drop katie_prompt + katie_prompt_version
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_katie_prompt_bump_version ON public.katie_prompt;
DROP FUNCTION IF EXISTS public.bump_katie_prompt_version();

DROP TABLE IF EXISTS public.katie_prompt CASCADE;
DROP TABLE IF EXISTS public.katie_prompt_version CASCADE;

-- ----------------------------------------------------------------------------
-- 3. Drop proactive_schedules (FK from chat_messages gone via CASCADE below)
-- ----------------------------------------------------------------------------

-- chat_messages FK to proactive_schedules — drop before dropping target.
ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_schedule_fk;

DROP TABLE IF EXISTS public.proactive_schedules CASCADE;

-- ----------------------------------------------------------------------------
-- 4. Drop chat_cost_daily + increment_chat_cost
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.increment_chat_cost(UUID, INTEGER, INTEGER, INTEGER, NUMERIC, BOOLEAN);
DROP TABLE IF EXISTS public.chat_cost_daily CASCADE;

-- ----------------------------------------------------------------------------
-- 5. Drop chat_summaries
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.chat_summaries CASCADE;

-- ----------------------------------------------------------------------------
-- 6. Drop agent_memory
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.agent_memory CASCADE;

-- ----------------------------------------------------------------------------
-- 7. Drop chat_messages
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.chat_messages CASCADE;

-- ----------------------------------------------------------------------------
-- 8. Drop bloombot
-- ----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.bloombot CASCADE;

-- ----------------------------------------------------------------------------
-- 9. Drop is_admin_user() function
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.is_admin_user();

COMMIT;

-- ============================================================================
-- Post-rollback verification — run manually after executing this file:
--
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN (
--     'bloombot', 'chat_messages', 'agent_memory', 'chat_summaries',
--     'chat_cost_daily', 'proactive_schedules', 'katie_prompt',
--     'katie_prompt_version'
--   );
--   -- Expected: zero rows
--
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('is_admin_user', 'increment_chat_cost', 'bump_katie_prompt_version');
--   -- Expected: zero rows
--
--   \d bapp_logs
--   -- Expected: no is_active column; type CHECK excludes 'custom'
-- ============================================================================
