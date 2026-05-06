/**
 * Assistant (Katie) message row — left-aligned, sparkle accent, no bubble.
 *
 * Proactive messages get a slightly deeper sparkle colour + a subtle
 * background highlight until read. The visible "Proactive" / "Scheduled"
 * pill chip was removed per user feedback (2026-05-06) — the unread
 * highlight + Katie tab badge already signal that something arrived,
 * the pill was redundant noise.
 */

import { SparkleIcon } from "./SparkleIcon";
import type { TriggerSource } from "./types";
import { RenderTile } from "@/components/katie/tiles/TileRegistry";
import type { ChatTile } from "@/lib/chat/tiles";

export interface AssistantMessageProps {
  content: string;
  triggerSource?: TriggerSource;
  isUnread?: boolean;
  tile?: ChatTile | null;
}

export function AssistantMessage({
  content,
  triggerSource = "assistant_reply",
  isUnread = false,
  tile = null,
}: AssistantMessageProps) {
  const isProactive = triggerSource.startsWith("proactive_");

  return (
    <div
      className={
        "flex gap-2 rounded-xl px-1 py-1 transition-colors " +
        (isUnread ? "bg-violet-50/50" : "")
      }
      aria-live="polite"
    >
      <SparkleIcon
        className={
          "mt-1 h-3.5 w-3.5 shrink-0 " +
          (isProactive ? "text-violet-600" : "text-violet-500")
        }
      />
      <div className="flex-1 space-y-2 text-sm text-slate-900">
        {content ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : null}
        {tile ? <RenderTile tile={tile} /> : null}
      </div>
    </div>
  );
}
