/**
 * Routes a KatieMessage to the correct row component.
 */

import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { KatieMessage } from "./types";

interface MessageRowProps {
  message: KatieMessage;
  /** True when this is the most-recent assistant message in the
   *  rendered list. Drives the SparkleIcon visibility — older
   *  assistant messages omit the icon so the conversation reads
   *  cleaner (per user feedback 2026-05-07). KatieDeck computes the
   *  index of the last assistant message and passes the flag. */
  isMostRecentAssistant?: boolean;
}

export function MessageRow({
  message,
  isMostRecentAssistant = false,
}: MessageRowProps) {
  if (message.role === "user") {
    return <UserMessage content={message.content} />;
  }
  if (message.role === "assistant") {
    return (
      <AssistantMessage
        content={message.content}
        triggerSource={message.trigger_source}
        isUnread={!message.is_read}
        tile={message.tile ?? null}
        showIcon={isMostRecentAssistant}
      />
    );
  }
  // system / tool rows are internal — hide from user surface
  return null;
}
