/**
 * Shared message types for Katie deck components.
 * Mirror shape of chat_messages rows for SSR + Realtime.
 */

import type { ChatTile } from "@/lib/chat/tiles";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type TriggerSource =
  | "user"
  | "assistant_reply"
  | "proactive_module"
  | "proactive_scheduled"
  | "proactive_template"
  | "proactive_manual";

export interface KatieMessage {
  id: string;
  role: MessageRole;
  content: string;
  trigger_source: TriggerSource;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  /** Optional inline tile rendered with this message. */
  tile?: ChatTile | null;
}
