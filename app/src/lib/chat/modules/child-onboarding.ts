/**
 * `child-onboarding` module — Katie's introduction-to-the-service cascade
 * fired when a nanny adds a child or a parent claims an invite.
 *
 * Spec: `system/APP/Ammendments/V 1.1/A-08-katie-guided-onboarding.md`
 *
 * Module ID: `child-onboarding` (NOT `onboarding` — that id belongs to
 * the parent position-creation coach in `./onboarding.ts`).
 *
 * Lifecycle (from A-08 § 'Architecture'):
 *   1. Server action (`createChild` / `createChildAsParent` /
 *      `connect_child_invite`) creates a celebration tile and dispatches
 *      a proactive trigger (`child.created` for the nanny side,
 *      `parent.connected_to_child` for the parent side).
 *   2. The trigger fires a tier-1 template welcome message into the
 *      bot's chat_messages, ready for the user when they next open
 *      Katie's deck.
 *   3. As the user replies, Katie generates responses guided by this
 *      module's `systemPromptFragment` + the per-turn state table
 *      injected into the runtime header by `renderOnboardingStateBlock`.
 *   4. After each captured / skipped / deferred topic, Katie calls
 *      `update_onboarding_state` (lands in T4) to advance the state
 *      machine.
 *   5. When the wrap step captures, the tool also flips
 *      `bot.settings.onboarding_completed = true`. From that moment the
 *      `enabledForBot` predicate filters this module out entirely —
 *      tools, fragment, and triggers all disappear from Katie's
 *      context.
 *
 * Build progress (this file lives across multiple atomic units):
 *   T2 — module skeleton: id, rolesAllowed, enabledForBot, empty tools/triggers
 *   T3 — system prompt fragment + runtime state-table renderer (THIS UNIT)
 *   T4 — `update_onboarding_state` tool implementation
 *   T5 — `child.created` proactive trigger
 *   T6 — `parent.connected_to_child` proactive trigger
 *   T10 — registry import + ALL_MODULES entry
 */

import type { BloomBotModule } from "./types";
import type {
  BotSettings,
  OnboardingState,
  OnboardingTopicId,
} from "@/types/bapp";

// Declared before the module export to avoid TDZ at module init.
const ONBOARDING_SYSTEM_PROMPT_FRAGMENT = [
  "## Onboarding cascade",
  "",
  "The user has just added a child (nanny path) or claimed a child invite (parent path) and you are running their introduction to Baby Bloom. Read the **Onboarding state** block in the runtime header before every response — it tells you what's been captured, what's been skipped, what's deferred, and which step is next.",
  "",
  "**This is an INTRODUCTION to the service, NOT a data-collection wizard.** Nothing in the cascade is required. All required child data was captured before you started talking. Your job is to introduce yourself, showcase what the service does by doing it with the user, and populate the feed along the way. If the user gives you nothing during this entire conversation, the celebration tile + your welcome are still enough — that is a perfectly valid outcome.",
  "",
  "### Topics, in order (skippable, re-orderable on user lead)",
  "",
  "Topic ids in **bold** are the values to pass to `update_onboarding_state(topic, ...)`. NEVER speak these ids to the user — they are internal. The user-facing names appear in the prose.",
  "",
  "1. **welcome** — handled by the proactive template that opened this conversation. Your first response continues from there.",
  '2. **schedule** — "When are you with {{child_first_name}}?" Days only, not firm time-of-day. Tile-button day options + a free-text fallback. Persist via `write_memory` (scope=shared) and `create_schedule` if a clear weekday pattern emerges.',
  '3. **routine** — nap times, meal times, bottle (only if `{{child_age_months}} < 24`). Roughly — routines change. **DO NOT mention or offer "bath time"** — too intimate, never surface this. Persist via `write_memory` + `create_schedule` for time-anchored items.',
  '4. **dev_snapshot** — user-facing name is "milestones" / "progress" / "update {{child_first_name}}\'s progress". NEVER speak the topic id `dev_snapshot` to the user. Just ask, with the benefit as the WHY in one line: "Couple of quick ones to update {{child_first_name}}\'s milestones — helps me suggest better activities for her." Then 2-4 questions tuned to `{{child_age_months}}`. Call `read_milestones` for the current bracket + the bracket below first; bulk-call `update_progress` covering all 7 EYLF domains in 1-2 calls. Then create ONE summary tile: "{{child_first_name}}\'s development has been updated" — NEVER list every milestone (could be hundreds). The Progress tab shows the full breakdown.',
  '5. **first_post** — guided tutorial, not data capture. "Now — let\'s work on your first post. What have you done recently with {{child_first_name}}?" When the user shares a moment, your normal observation-share response applies (your personality section governs voice). Create the custom tile inline via `create_tile`. Optional photo. Up to 2-3 backfill posts.',
  "6. **activity** — offer to plan one via `plan_activity`. Accept decline gracefully — they are likely setting up while on shift.",
  "7. **child_photo** — light ask. Don't push. Skip is fine.",
  "8. **wrap** — final message with the action-button link to the child's feed. **Use `create_tile` with an `action` button** rather than typing a URL into chat — the tile machinery substitutes the child id from your trigger context, so you never compose a UUID in plain text. Then call `update_onboarding_state(topic='wrap', status='captured')` — that is the only thing that flips `onboarding_completed = true` and drops this entire onboarding context from your next turn's prompt.",
  "",
  "### Onboarding-specific additions (these ADD to your personality section)",
  "",
  '- **Don\'t ask permission to ask.** Meta-permission gates ("Want me to ask you a question?") are friction. Just ask, with the benefit as the WHY in one line.',
  "- **Bath time, never.** Too intimate, do not surface this anywhere in the cascade.",
  '- **"Snapshot" is internal-only.** When talking to the user use "milestones" / "progress" / "update {{child}}\'s progress". The topic id `dev_snapshot` only appears in `update_onboarding_state` arguments — never in prose.',
  "- **Age-appropriate gating.** Don't ask about bottles if `{{child_age_months}} >= 24`. Don't ask about words if `{{child_age_months}} < 6`. Adapt every question to age.",
  "- **Pace by the user's last reply length.** If their last reply was a single tile-button tap or under ~5 words, shorten your next message and skip aggressively. Don't drag.",
  "- **Total cascade for an engaged user: ~10-15 user-turns.** Quicker is fine; longer reads as a form.",
  '- **Trust + privacy framing once.** The welcome already includes the data-visibility line ("just between you, {{counterpart}}, and me"). Don\'t repeat.',
  '- **Show results visibly.** When the user shared something, render the tile or surface the change inline so they SEE the system responding. Don\'t just say "thanks, noted."',
  '- **Skipping is never a failure state.** Set `topics[topic].status = \'skipped\'` via `update_onboarding_state`, acknowledge in one line, move on. Never frame skipped items as "incomplete" or "missing."',
  '- **Deferred ≠ skipped.** When a user says "later" / "I\'ll do it later", set status to `\'deferred\'` — re-offer in subsequent sessions (banner / natural re-trigger). Skipped is permanent for this cascade.',
  '- **On wrap or early exit, naturally surface what\'s still on offer.** If the user skipped photos + activity-planning + routine, your wrap might say "anytime you want to set a routine, add a photo, or have me plan an activity, just ask." Conversational, not a checklist.',
  "",
  "### Milestones-update step (the one topic you can gently revisit later)",
  "",
  "If the milestones step has not yet captured (status `pending` or `skipped` in the runtime state table):",
  "- You may organically mention the benefit when contextually relevant — e.g. when the user asks for an activity suggestion or asks how {{child_first_name}} is tracking. ONE in-context mention per natural opportunity, not on repeat.",
  "- You may schedule a low-key weekly check via `create_schedule`. Cancel that schedule the moment the milestones step captures. If the user dismisses or ignores 2-3 weekly nudges in a row, cancel the schedule yourself and stop mentioning it for 30 days.",
  "- Always pair the offer with an alternative (\"or just say 'general' and I'll suggest something off the cuff\").",
  '- Never frame it as "incomplete" or "missing" or "required". Never block another action behind it.',
  "",
  "If the milestones step is `captured`: don't revisit. Reference the data naturally as context.",
  "",
  "### State updates",
  "",
  "After completing each topic — capturing input, accepting a skip, accepting a defer — call `update_onboarding_state(topic, status, summary?)` to advance the state machine. The tool bumps `last_active_at` and updates `current_step` to the next pending topic. The wrap step is the ONLY thing that flips `onboarding_completed = true`; once that flips, this entire prompt section drops out of your context on the next turn.",
  "",
  "### What you do NOT do (onboarding-specific — your personality + boundaries cover the rest)",
  "",
  '- Push a skipped step ("are you sure?")',
  "- Treat the user like they are filling in a form",
  "- Compose a URL containing a child id, user id, or any other UUID in plain text — always route through `create_tile`'s `action` slot",
].join("\n");

export const childOnboardingModule: BloomBotModule = {
  id: "child-onboarding",
  name: "Child Onboarding",
  description:
    "Katie-guided introduction to the service after a child is added or an invite is claimed. Walks the user through showcase + setup, populates the feed along the way. Cascade gates itself off via `enabledForBot` once `bot.settings.onboarding_completed` flips true.",

  // Both nannies and parents get an onboarding cascade — different
  // welcomes (full vs lightweight, nanny vs parent) but the same module
  // owns both. The trigger's `resolvePayload` picks the variant from
  // bot context.
  rolesAllowed: ["nanny", "parent"],

  // Per-bot self-removal. Once a bot's onboarding is complete, the
  // module disappears entirely — no tools, no system prompt fragment,
  // no triggers. The chat route + the proactive dispatcher both honour
  // this predicate (see registry.ts two-pass filter contract).
  //
  // Defensive shape: any value other than literal `true` keeps the
  // module active. A bot row missing the field, undefined settings, a
  // non-boolean truthy value (theoretically possible since the JSONB
  // column is `unknown` outside the typed fields) all mean "not yet
  // completed". The only thing that turns the module off is an
  // explicit `true` — which only the wrap step writes.
  enabledForBot: (settings) => settings.onboarding_completed !== true,

  // Tools land in T4 (`update_onboarding_state`). Empty array is a
  // valid module shape per BloomBotModule — the registry's collectTools
  // skips modules with no tools naturally.
  tools: [],

  // Proactive triggers land in T5 + T6 (`child.created`,
  // `parent.connected_to_child`).
  proactiveTriggers: [],

  // Until T4 lands a tool, this handler is unreachable from the chat
  // route (no tool definitions = no Gemini function calls routed
  // here). Defensive return for the unreachable case so a future
  // misroute fails loudly instead of silently.
  async execute(toolName) {
    return {
      success: false,
      error: `Unknown tool '${toolName}' on child-onboarding (no tools registered yet — T4 lands update_onboarding_state).`,
    };
  },

  systemPromptFragment: ONBOARDING_SYSTEM_PROMPT_FRAGMENT,
};

// ── Onboarding state — runtime renderer ─────────────────────────────────────
//
// Per `system/APP/Ammendments/V 1.1/A-08-katie-guided-onboarding.md`
// § 'How Katie uses this state', Katie sees the current per-topic
// state on every onboarding-mode turn. The state table is per-bot +
// per-turn data, so it lives in the RUNTIME context (not the static
// prompt — the static prompt is cached and shared across users).
//
// `renderOnboardingStateBlock` returns the markdown block when a bot
// has an active cascade, or `null` when there's nothing to render
// (no settings, no state, or onboarding already completed). Wired
// into `buildRuntimeContext` so Katie reads it alongside the date
// header, developmental snapshot, and memory table.

/** Friendly first-character-uppercased renderer for status enums.
 *  Kept outside the renderer so it can be table-tested. */
function statusLabel(
  s: "pending" | "captured" | "skipped" | "deferred",
): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Iteration order for the rendered state table. Tuple-typed against
 *  every member of `OnboardingTopicId` so adding a new topic to the
 *  union without updating this list produces a TypeScript error
 *  rather than a silently-omitted row. */
const TOPIC_ORDER = [
  "welcome",
  "schedule",
  "routine",
  "dev_snapshot",
  "first_post",
  "activity",
  "child_photo",
  "wrap",
] as const satisfies readonly OnboardingTopicId[];
// Compile-time exhaustiveness assertion: if a new OnboardingTopicId
// is added and TOPIC_ORDER doesn't include it, this line errors.
type _TOPIC_ORDER_EXHAUSTIVE =
  (typeof TOPIC_ORDER)[number] extends OnboardingTopicId
    ? OnboardingTopicId extends (typeof TOPIC_ORDER)[number]
      ? true
      : never
    : never;
const _topicOrderExhaustive: _TOPIC_ORDER_EXHAUSTIVE = true;
void _topicOrderExhaustive;

/** Truncate-or-pad a cell to a fixed width. Long captured summaries
 *  would otherwise overflow `padEnd` and break table alignment for
 *  every row below them — at 22 chars (the column width) this caps
 *  reasonably while keeping enough signal. The "…" marker tells the
 *  reader (Katie) that the value was elided so she doesn't quote a
 *  truncated string back to the user. */
function fitCell(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  return value.slice(0, width - 1) + "…";
}

/** Render the per-topic onboarding state block as a markdown section
 *  Katie reads at the top of every onboarding-mode response.
 *
 *  Returns null when no cascade is active for this bot — the
 *  renderer is conservative: missing settings, missing
 *  `onboarding_state`, or `onboarding_completed === true` all skip
 *  the block. This is defense-in-depth on top of the
 *  `enabledForBot` predicate that already removes the module
 *  entirely once a bot completes; it ensures that even if a future
 *  caller forgets to thread `botSettings` to the registry filter,
 *  the runtime block still drops out cleanly.
 *
 *  Signature accepts `BotSettings | undefined` only — `null` is not
 *  produced by any current caller (`BotContext.botSettings` is
 *  `BotSettings | undefined`). Narrower contract = clearer intent. */
export function renderOnboardingStateBlock(
  settings: BotSettings | undefined,
): string | null {
  if (!settings) return null;
  if (settings.onboarding_completed === true) return null;
  const state: OnboardingState | undefined = settings.onboarding_state;
  if (!state) return null;

  const lines: string[] = [
    "## Onboarding state (read before every response)",
    "",
    "| Topic         | Status     | Summary                |",
    "|---------------|------------|------------------------|",
  ];

  for (const id of TOPIC_ORDER) {
    const topic = state.topics[id];
    // Defensive: a partially-written DB row could miss a topic key.
    // Skip silently — the row simply won't appear in the table.
    if (!topic) continue;
    // Discriminated-union narrowing: `summary` only exists on the
    // `captured` variant. For other statuses there is no summary
    // at all (encoded in the type), so render an em-dash.
    const summaryCell = topic.status === "captured" ? topic.summary : "—";
    lines.push(
      `| ${fitCell(id, 13)} | ${fitCell(statusLabel(topic.status), 10)} | ${fitCell(summaryCell, 22)} |`,
    );
  }

  lines.push("");
  lines.push(`current_step: ${state.current_step}`);
  lines.push(`last_active_at: ${state.last_active_at}`);

  return lines.join("\n");
}
