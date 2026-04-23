/**
 * Shared helpers for BloomBot modules.
 */

import type { ChildSummary } from "@/lib/chat/context";
import type { ToolResult } from "./types";

/**
 * Resolves a child from an optional `child_name` tool argument.
 *
 * Single-child user → always returns that child.
 * Multi-child user → must match by first name (case-insensitive).
 * Unmatched → returns a helpful error ToolResult listing the children.
 */
export function resolveChild(
  nameArg: unknown,
  children: ChildSummary[],
):
  | { child: ChildSummary; error?: undefined }
  | { child?: undefined; error: ToolResult } {
  if (children.length === 0) {
    return {
      error: {
        success: false,
        error:
          "You don't yet have any children in the system. Add a child through onboarding before asking me to log or read data.",
      },
    };
  }

  // Single-child users can omit child_name
  if (children.length === 1) {
    if (nameArg == null || nameArg === "") return { child: children[0] };
    const name = String(nameArg).toLowerCase();
    if (children[0].firstName.toLowerCase() === name)
      return { child: children[0] };
    return {
      error: {
        success: false,
        error: `I don't recognise "${nameArg}". The only child I have access to is ${children[0].firstName}.`,
      },
    };
  }

  // Multi-child — must be specified
  if (nameArg == null || nameArg === "") {
    const names = children.map((c) => c.firstName).join(", ");
    return {
      error: {
        success: false,
        error: `You have multiple children (${names}). Which one?`,
      },
    };
  }

  const name = String(nameArg).toLowerCase();
  const match = children.find((c) => c.firstName.toLowerCase() === name);
  if (!match) {
    const names = children.map((c) => c.firstName).join(", ");
    return {
      error: {
        success: false,
        error: `I don't recognise "${nameArg}". You have access to: ${names}.`,
      },
    };
  }
  return { child: match };
}
