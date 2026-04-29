"use client";

/**
 * KatieQuickActions — role-aware one-tap chips that act as starter
 * prompts for the chat.
 *
 * Renders ONLY in the empty-state of the deck (no user messages yet
 * AND not currently streaming). Once the user types or taps a chip,
 * the chips disappear and the conversation thread takes over the
 * surface — keeping the ongoing chat clean of input chrome.
 *
 * Each chip is a literal user-message string. Tapping a chip
 * immediately dispatches it via `onSelect` (same path the input
 * uses), so the chat history shows the chip text as the user's
 * message — no hidden / synthetic content.
 *
 * Role-aware:
 *   - parent: position, placement, milestones, weekly summary
 *   - nanny:  job matches, action items, profile, recent feed
 *
 * The chip lists are intentionally short (4 chips × ~24 chars) — any
 * more and the empty state becomes a menu, which is a different UX.
 */

interface QuickActionChip {
  label: string;
  prompt: string;
}

const PARENT_CHIPS: readonly QuickActionChip[] = [
  { label: "Show my position", prompt: "Show me my position" },
  { label: "Who's my nanny?", prompt: "Who's my nanny?" },
  { label: "Recent updates", prompt: "What's new this week?" },
  { label: "Anything I need to do?", prompt: "Anything I need to do?" },
] as const;

const NANNY_CHIPS: readonly QuickActionChip[] = [
  { label: "Any new jobs?", prompt: "Any new jobs for me?" },
  { label: "Action items", prompt: "What needs my attention?" },
  { label: "My profile", prompt: "Show me my profile" },
  { label: "Verification status", prompt: "What's my verification status?" },
] as const;

/**
 * Returns the chip list for a given role. Exported for tests; the
 * component reads it via the same map. Anything not "nanny" or
 * "parent" returns an empty array (admin etc — no chips).
 */
export function chipsForRole(role: string): readonly QuickActionChip[] {
  if (role === "parent") return PARENT_CHIPS;
  if (role === "nanny") return NANNY_CHIPS;
  return [];
}

export interface KatieQuickActionsProps {
  role: string;
  onSelect: (prompt: string) => void;
}

export function KatieQuickActions({ role, onSelect }: KatieQuickActionsProps) {
  const chips = chipsForRole(role);
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Quick actions"
      className="flex flex-wrap gap-2"
    >
      {chips.map((chip) => (
        <button
          key={chip.prompt}
          type="button"
          onClick={() => onSelect(chip.prompt)}
          // py-1.5 + text-xs lands at ≈28px tall — clears the WCAG 2.5.8
          // 24×24 minimum. gap-2 between chips ensures the 24px exclusion
          // circle doesn't intersect a neighbour when chips wrap.
          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
