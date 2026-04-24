-- ============================================================================
-- Migration: katie-tiles
-- Adds:
--   - chat_messages.tile JSONB column — persists inline Katie chat tiles so
--     they re-render when a user scrolls back through history.
-- Depends on: katie-foundation.sql (chat_messages)
-- Rollback: katie-tiles-rollback.sql
-- ============================================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS tile JSONB;

COMMENT ON COLUMN public.chat_messages.tile IS
  'Optional inline tile rendered with this message. Shape is validated app-side (ChatTile discriminated union — see src/lib/chat/tiles.ts). NULL for user messages and for assistant turns that were text-only.';

-- Partial index: cheap lookup for any history scan that wants only messages
-- with tiles (e.g. "show me everything Katie has ever pinned").
CREATE INDEX IF NOT EXISTS idx_chat_messages_with_tile
  ON public.chat_messages(bloombot_id, created_at DESC)
  WHERE tile IS NOT NULL;
