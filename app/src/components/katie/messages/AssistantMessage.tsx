/**
 * Assistant (Katie) message row — left-aligned, sparkle accent, no bubble.
 *
 * Proactive messages get a small "Proactive" pill + subtle background
 * highlight until read.
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
        {isProactive ? (
          <div className="flex items-center gap-1.5 text-xs text-violet-700">
            <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium">
              {triggerSource === "proactive_scheduled"
                ? "Scheduled"
                : "Proactive"}
            </span>
          </div>
        ) : null}
        {content ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        ) : null}
        {tile ? <RenderTile tile={tile} /> : null}
      </div>
    </div>
  );
}
