/**
 * Shared helpers for BloomBot modules.
 */

import type { ChildSummary } from "@/lib/chat/context";
import type { ToolResult } from "./types";

/**
 * A user-facing role that the connections + profile modules can
 * operate on. Admin has its own surface (admin inspection tools) and
 * is deliberately excluded here.
 */
export type UserFacingRole = "nanny" | "parent";

/**
 * Narrow the bot's effective role to nanny/parent. Used as the
 * single gate for every module tool that only runs on user-facing
 * accounts. Returns null when the role is admin or unrecognised, so
 * the caller can surface a consistent error.
 */
export function asUserFacingRole(effectiveRole: string): UserFacingRole | null {
  if (effectiveRole === "nanny" || effectiveRole === "parent") {
    return effectiveRole;
  }
  return null;
}

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
  // Bound the user-supplied name when echoing into messages — it
  // arrives via Gemini's tool-call args which are unverified `unknown`.
  // 60 chars is plenty for any real first name and prevents pathological
  // strings (10KB blobs, control chars) bleeding into the assistant
  // reply Gemini will surface.
  const safeName =
    typeof nameArg === "string" && nameArg.length > 0
      ? String(nameArg).slice(0, 60)
      : null;

  if (children.length === 0) {
    // Terminal: nothing to retry. Either the user has no children
    // attached at all, or they referenced one that isn't linked.
    const opener = safeName
      ? `I don't see ${safeName} linked to your account yet.`
      : "I don't have any children linked to your account yet.";
    return {
      error: {
        success: false,
        terminal: true,
        error: `${opener} If they're your child, you'll need to set up a position so a nanny can be matched, or wait for a placement to be confirmed. Want help with that, or did you mean a different name?`,
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
        terminal: true,
        error: `I don't see ${safeName} on your account — the only child linked here is ${children[0].firstName}. Did you mean ${children[0].firstName}, or someone else?`,
      },
    };
  }

  // Multi-child — must be specified
  if (nameArg == null || nameArg === "") {
    const names = children.map((c) => c.firstName).join(", ");
    return {
      error: {
        success: false,
        terminal: true,
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
        terminal: true,
        error: `I don't see ${safeName} on your account. You have access to: ${names}. Did you mean one of those, or is the spelling off?`,
      },
    };
  }
  return { child: match };
}
