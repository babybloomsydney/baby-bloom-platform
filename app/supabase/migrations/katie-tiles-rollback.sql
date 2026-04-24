-- Rollback for katie-tiles.sql
DROP INDEX IF EXISTS public.idx_chat_messages_with_tile;

ALTER TABLE public.chat_messages
  DROP COLUMN IF EXISTS tile;
