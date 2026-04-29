/**
 * Helpers extracted from route.ts so they can be exported + unit-tested.
 * Route files can only export POST/GET/etc. per Next.js rules.
 *
 *   - pickFallbackText: chooses the Katie-voice synthetic reply when
 *     Gemini returns no narration after a tool call.
 *   - safeToolResultForClient: sanitises a ToolResult before SSE
 *     streaming so raw error messages (DB constraint text, internal
 *     field names) never reach the browser.
 */

import type { ToolResult } from "@/lib/chat/modules/types";

/**
 * Strips raw `error` text from a ToolResult before streaming to the
 * client. Gemini-side recovery still gets the full result; only the SSE
 * payload is sanitised.
 */
export function safeToolResultForClient(result: ToolResult): {
  success: boolean;
  hasTile: boolean;
  feedEntry: boolean;
} {
  return {
    success: result.success,
    hasTile: result.tile !== undefined,
    feedEntry: result.feedEntry === true,
  };
}

/**
 * Picks the Katie-voice fallback text when Gemini returns no narration
 * after a tool call. Branch order: tool error first (silent failure),
 * tool produced a visible artefact (tile or feed row), tool succeeded
 * but produced nothing visible, no tool ran at all.
 *
 * NEVER includes tool names, mechanism words ("ran", "called",
 * "attempted", "tried"), or raw error messages.
 */
export function pickFallbackText(
  last: { result: ToolResult } | undefined,
): string {
  if (last?.result.error) {
    return "Hmm — that didn't go through. Want to try again?";
  }
  if (last?.result.tile || last?.result.feedEntry) {
    return "Done — see above.";
  }
  if (last) {
    return "I have what I need but couldn't put it into words. Ask me again?";
  }
  return "Sorry — I didn't have anything to say there. Try rephrasing?";
}
