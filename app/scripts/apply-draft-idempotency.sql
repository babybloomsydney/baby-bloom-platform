-- ============================================================================
-- Apply WU 11.3 — server-side idempotency for /api/chat/drafts/accept.
--
-- Without this, a double-click on Accept (or a network retry from the
-- chat client) creates duplicate bapp_logs rows, runs the cascade
-- twice, and clutters the feed.
--
-- Design: tiny `chat_draft_locks` table keyed by draft_id (the
-- client-generated UUID on the draft tile). The accept route INSERTs
-- a row before calling applyDraft. The PRIMARY KEY constraint causes
-- the second concurrent (or retried) call to fail with code 23505,
-- which the route translates to HTTP 409.
--
-- On apply failure the route DELETEs the lock so the user can retry.
-- On apply success the lock stays — protecting against retry-after-
-- success too.
--
-- Cleanup: rows older than 7 days are purged by /api/cron/compact-daily
-- (added in this WU). Drafts that old are no longer in any chat
-- session — the user couldn't re-click them anyway.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_draft_locks (
  draft_id     TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name    TEXT NOT NULL,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_draft_locks_acquired_at
  ON public.chat_draft_locks (acquired_at);

ALTER TABLE public.chat_draft_locks ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for regular users.
-- The accept route uses the service-role admin client which bypasses
-- RLS — that's the only path that touches this table.

COMMENT ON TABLE public.chat_draft_locks IS
  'WU 11.3 — tracks accepted drafts by client-generated draft_id so retries return 409 instead of duplicating bapp_logs rows. Pruned daily by /api/cron/compact-daily after 7 days.';

COMMIT;

-- Verify:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'chat_draft_locks';
-- \d+ public.chat_draft_locks
