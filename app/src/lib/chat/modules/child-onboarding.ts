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
 *      bot's chat_messages with `is_read = false`, ready for the user
 *      when they next open Katie's deck.
 *   3. As the user replies, Katie generates ai-full responses guided by
 *      this module's systemPromptFragment + the rendered onboarding
 *      state table.
 *   4. After each captured/skipped/deferred topic, Katie calls
 *      `update_onboarding_state` to advance the state machine.
 *   5. When the wrap step captures, the tool also flips
 *      `bot.settings.onboarding_completed = true`. From that moment on
 *      the `enabledForBot` predicate filters this module out entirely —
 *      its tools, fragment, and triggers all disappear from Katie's
 *      context. No extra tokens, no risk of stale tool calls.
 *
 * THIS FILE — Unit 2 SKELETON ONLY.
 *   • The module shape is in place: id, name, description, rolesAllowed,
 *     enabledForBot. Empty tools and proactiveTriggers.
 *   • The systemPromptFragment + tools land in subsequent units (T3 +
 *     T4-T6). Until then, the module exports cleanly but contributes no
 *     prompt fragment and no tools to the chat surface.
 *   • The module is intentionally NOT registered in `registry.ts` yet
 *     (T10 does that). That keeps each unit independently shippable and
 *     reviewable.
 */

import type { BloomBotModule } from "./types";

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

  // systemPromptFragment lands in T3. Until then this module
  // contributes nothing to the assembled prompt — see
  // context.ts buildStaticPrompt which skips falsy fragments.
};
