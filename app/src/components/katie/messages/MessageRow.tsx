/**
 * Routes a KatieMessage to the correct row component.
 */

import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { KatieMessage } from "./types";

export function MessageRow({ message }: { message: KatieMessage }) {
  if (message.role === "user") {
    return <UserMessage content={message.content} />;
  }
  if (message.role === "assistant") {
    return (
      <AssistantMessage
        content={message.content}
        triggerSource={message.trigger_source}
        isUnread={!message.is_read}
      />
    );
  }
  // system / tool rows are internal — hide from user surface
  return null;
}
