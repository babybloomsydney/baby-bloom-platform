"use client";

/**
 * Subscribes to new chat_messages rows for the current bot and maintains
 * the unread count in KatieContext. Polling fallback kept simple: if
 * subscription drops we re-fetch bot-info every 30s.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useKatie } from "@/contexts/KatieContext";

const POLL_INTERVAL_MS = 30_000;

export function useKatieRealtime() {
  const { setUnreadCount } = useKatie();
  const botIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
      null;

    async function hydrate() {
      try {
        const res = await fetch("/api/chat/bot-info", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          botId: string | null;
          unreadCount: number;
        };
        if (cancelled) return;
        botIdRef.current = data.botId;
        setUnreadCount(data.unreadCount);
        if (data.botId) subscribe(data.botId);
      } catch {
        // Non-fatal — polling fallback covers this
      }
    }

    function subscribe(botId: string) {
      const supabase = createClient();
      channel = supabase
        .channel(`katie-unread-${botId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `bloombot_id=eq.${botId}`,
          },
          (payload) => {
            const row = payload.new as { is_read?: boolean };
            if (row && row.is_read === false) {
              setUnreadCount((prev) => prev + 1);
            }
          },
        )
        .subscribe();
    }

    void hydrate();
    pollHandle = setInterval(() => {
      void hydrate();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
      if (channel) {
        void createClient().removeChannel(channel);
      }
    };
    // setUnreadCount is stable from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
