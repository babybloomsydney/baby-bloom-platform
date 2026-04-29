"use client";

/**
 * KatieDeck — the conversation surface.
 *
 * Scrollable message list + input pinned to bottom + footer disclaimer.
 * Fetches message history on mount (Phase 1); Realtime subscription
 * comes in Phase 1D.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { KatieHeader } from "./KatieHeader";
import { KatieFooter } from "./KatieFooter";
import { KatieInput } from "./KatieInput";
import { KatieQuickActions } from "./KatieQuickActions";
import { ImageAttachmentProvider } from "./image-attachment-context";
import { MessageRow } from "./messages/MessageRow";
import { AssistantMessage } from "./messages/AssistantMessage";
import { TypingIndicator } from "./messages/TypingIndicator";
import { SparkleIcon } from "./messages/SparkleIcon";
import type { KatieMessage } from "./messages/types";
import { useKatie } from "@/contexts/KatieContext";
import { useAuth } from "@/contexts/AuthContext";
import { useChatStream } from "./use-chat-stream";

interface EmptyStateProps {
  role: string;
  onChipSelect: (prompt: string) => void;
}

function EmptyState({ role, onChipSelect }: EmptyStateProps) {
  return (
    <div className="mt-8 flex flex-col items-start gap-3 text-sm text-slate-700">
      <SparkleIcon className="h-6 w-6 text-violet-500" />
      <p className="text-base font-medium text-slate-900">
        Hi — I&apos;m Katie.
      </p>
      <p>
        I can help you across all of Baby Bloom — child development, jobs,
        babysitting, verification, your profile.
      </p>
      <KatieQuickActions role={role} onSelect={onChipSelect} />
    </div>
  );
}

export function KatieDeck() {
  const { currentSurface } = useKatie();
  const { role } = useAuth();
  const [messages, setMessages] = useState<KatieMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Guards against rapid double-clicks (e.g., chip + chip, or
  // chip + Enter) firing two sends before `isStreaming` flips. The
  // disabled state on KatieInput / KatieQuickActions only updates
  // after `send` awaits its first network tick.
  const sendingRef = useRef(false);

  const { send, isStreaming, streamingText, streamingTile } = useChatStream();

  // Fetch history on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/messages?limit=30", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { messages: KatieMessage[] };
        if (cancelled) return;
        setMessages(data.messages ?? []);
      } catch {
        // non-fatal; empty state will show
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  // Append helper
  const append = useCallback((msg: KatieMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setLoadError(null);
      try {
        const result = await send(message, currentSurface, append);
        if (!result.ok && result.error) {
          setLoadError(result.error);
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [send, currentSurface, append],
  );

  return (
    <ImageAttachmentProvider>
      <div className="flex h-full flex-col bg-white">
        <KatieHeader />

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-4">
            {!isHydrating && messages.length === 0 && !isStreaming ? (
              <EmptyState role={role ?? ""} onChipSelect={handleSend} />
            ) : null}

            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}

            {isStreaming && (streamingText.length > 0 || streamingTile) ? (
              <AssistantMessage content={streamingText} tile={streamingTile} />
            ) : null}
            {isStreaming && streamingText.length === 0 && !streamingTile ? (
              <TypingIndicator />
            ) : null}

            {loadError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {loadError}
              </div>
            ) : null}
          </div>
        </div>

        <KatieInput disabled={isStreaming} onSend={handleSend} />
        <KatieFooter />
      </div>
    </ImageAttachmentProvider>
  );
}
