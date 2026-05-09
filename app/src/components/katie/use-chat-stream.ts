"use client";

/**
 * Client-side hook to POST /api/chat and consume the SSE stream.
 * Appends deltas to a growing assistant message; resolves when `done` received.
 */

import { useCallback, useState } from "react";
import type { KatieMessage } from "./messages/types";
import type { CurrentSurface } from "@/contexts/KatieContext";
import { isChatTile, type ChatTile } from "@/lib/chat/tiles";
import {
  KATIE_PRELOAD_PASSTHROUGH_ENABLED,
  KATIE_STREAM_DIAGNOSTICS,
} from "@/lib/chat/flags";
import type { PreloadedContext } from "@/lib/chat/preload/types";

export interface SendResult {
  ok: boolean;
  error?: string;
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTile, setStreamingTile] = useState<ChatTile | null>(null);

  const send = useCallback(
    async (
      message: string,
      currentSurface: CurrentSurface,
      onAppend: (msg: KatieMessage) => void,
      preload?: PreloadedContext,
    ): Promise<SendResult> => {
      setIsStreaming(true);
      setStreamingText("");
      setStreamingTile(null);

      // Optimistic user message
      const userMsg: KatieMessage = {
        id: `optimistic-user-${Date.now()}`,
        role: "user",
        content: message,
        trigger_source: "user",
        is_read: true,
        created_at: new Date().toISOString(),
      };
      onAppend(userMsg);

      try {
        // Latency:Efficiency build, WU7 (F2 client) — ship the
        // verified-by-server, client-published preload alongside
        // every turn. Skipped when the F2 client kill-switch flag
        // is off (kill-switch defaults to TRUE per WU1) OR when
        // the caller didn't supply preload (legacy callers + the
        // dispatcher continue to work unchanged).
        //
        // The empty-preload guard (`preload.as_of` truthy) avoids
        // sending `preload: {}` on every turn before any publisher
        // has fired. `as_of` is auto-stamped on the first
        // setPreloadSlots call, so its presence is the canonical
        // "anything published yet?" check. Per typescript-reviewer
        // + code-reviewer MEDIUM on WU7 — keeps telemetry clean.
        //
        // The route's verifyPreload re-checks ownership/freshness
        // on every slot before any of it touches the LLM context —
        // we ship lightly here, the heavy gate is server-side.
        const payload: Record<string, unknown> = { message, currentSurface };
        if (preload?.as_of && KATIE_PRELOAD_PASSTHROUGH_ENABLED) {
          payload.preload = preload;
        }
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}` };
        }
        if (!res.body) {
          return { ok: false, error: "No response body" };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let committedTile: ChatTile | null = null;
        let done = false;

        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            buffer += decoder.decode(value, { stream: true });

            // SSE frames are separated by \n\n
            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const rawFrame = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              if (!rawFrame.startsWith("data:")) continue;

              const json = rawFrame.slice(5).trim();
              if (!json) continue;

              try {
                const evt = JSON.parse(json) as
                  | { type: "text"; content: string }
                  | { type: "tool_call"; name: string; args: unknown }
                  | { type: "tool_result"; name: string; result: unknown }
                  | { type: "tile"; tile: unknown }
                  | { type: "error"; message: string }
                  | { type: "done" };

                if (evt.type === "text") {
                  if (KATIE_STREAM_DIAGNOSTICS) {
                    // V1.1 side fix 2 diagnostic — pair with the
                    // server-side line in /api/chat/route.ts so the
                    // delta-vs-arrival lag (HTTP buffering) can be
                    // measured. Length here matches the server's
                    // `len=` value when buffering is absent.
                    console.log(
                      `[stream-diag][client] t=${Date.now()} len=${evt.content.length} preview=${JSON.stringify(evt.content.slice(0, 24))}`,
                    );
                  }
                  fullText += evt.content;
                  setStreamingText(fullText);
                } else if (evt.type === "tile") {
                  // Last tile wins (matches server-side persistence rule).
                  if (isChatTile(evt.tile)) {
                    committedTile = evt.tile;
                    setStreamingTile(evt.tile);
                  }
                } else if (evt.type === "error") {
                  return { ok: false, error: evt.message };
                }
                // tool_call / tool_result — stream events the UI could
                // expose as ephemeral "Katie is doing X…" chips in a
                // future iteration. Swallow silently for now.
              } catch {
                // Malformed frame — skip
              }
            }
          }
        }

        // Commit the assistant message
        onAppend({
          id: `streamed-assistant-${Date.now()}`,
          role: "assistant",
          content: fullText,
          trigger_source: "assistant_reply",
          is_read: true,
          created_at: new Date().toISOString(),
          tile: committedTile,
        });

        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "send failed",
        };
      } finally {
        setIsStreaming(false);
        setStreamingText("");
        setStreamingTile(null);
      }
    },
    [],
  );

  return { send, isStreaming, streamingText, streamingTile };
}
