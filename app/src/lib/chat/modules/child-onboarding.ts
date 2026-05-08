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

import type {
  BloomBotModule,
  ModuleContext,
  ProactiveTrigger,
  SiteEvent,
  ToolResult,
} from "./types";
import type {
  BotSettings,
  OnboardingState,
  OnboardingTopic,
  OnboardingTopicId,
  OnboardingTopicStatus,
  OnboardingTopics,
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

// ── Module-level constants (ordered before all consumers) ──────────────────

/** Iteration order for the rendered state table + the canonical
 *  topic enum for `update_onboarding_state`. Tuple-typed against
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

/** Friendly first-character-uppercased renderer for status enums.
 *  Kept as a free function so it can be table-tested. */
function statusLabel(s: OnboardingTopicStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

// ── update_onboarding_state — tool handler ──────────────────────────────────
//
// Mutates `bot.settings.onboarding_state` via the established
// read-merge-write JSONB pattern (see katie-scheduling.ts for the
// canonical reference) and conditionally flips
// `bot.settings.onboarding_completed` when the wrap topic captures.
//
// Idempotency: writing the same {topic, status, summary} twice yields
// the same final state — there's no append-only log here, just a
// keyed assignment in `topics[topic]`. Concurrent writes use last-
// write-wins on the JSONB column (Postgres-level), which is
// acceptable: the cascade is a single-user single-session flow and
// concurrent calls would only happen if Katie races two tool calls
// in the same turn, which would be a model bug worth surfacing.

const VALID_STATUSES: readonly OnboardingTopicStatus[] = [
  "pending",
  "captured",
  "skipped",
  "deferred",
];

/** Build the initial OnboardingState (welcome captured, everything
 *  else pending). The proactive trigger that opens the cascade
 *  (T5/T6) initialises this on first fire; the tool also
 *  initialises defensively in case the trigger has not yet run or
 *  failed to write — without this fallback, the very first
 *  `update_onboarding_state` call would lose the implicit welcome
 *  capture. Each topic is a fresh literal (no shared reference) so
 *  any future per-topic mutation is structurally local — matches
 *  the project's immutable-updates convention. */
function freshInitialState(now: string): OnboardingState {
  const topics: OnboardingTopics = {
    welcome: { status: "captured", summary: "(greeted)" },
    schedule: { status: "pending" },
    routine: { status: "pending" },
    dev_snapshot: { status: "pending" },
    first_post: { status: "pending" },
    activity: { status: "pending" },
    child_photo: { status: "pending" },
    wrap: { status: "pending" },
  };
  return {
    started_at: now,
    last_active_at: now,
    current_step: "schedule",
    topics,
  };
}

/** Pick the next pending topic in canonical order. If everything is
 *  resolved (captured/skipped/deferred), return `wrap` so Katie
 *  knows to close the cascade. */
function nextPendingStep(topics: OnboardingTopics): OnboardingTopicId {
  for (const id of TOPIC_ORDER) {
    if (topics[id]?.status === "pending") return id;
  }
  return "wrap";
}

/** Discriminated-union args type — `captured` requires `summary`,
 *  other statuses forbid it. Encoding the invariant here lets
 *  `buildTopicRecord` narrow without an `as string` cast. */
type UpdateOnboardingStateArgs =
  | {
      topic: OnboardingTopicId;
      status: "captured";
      summary: string;
      count?: number;
    }
  | {
      topic: OnboardingTopicId;
      status: "pending" | "skipped" | "deferred";
      count?: number;
    };

/** Argument validation. Returns a discriminated success or a
 *  ToolResult-shaped failure with a user-facing error string. Hand-
 *  rolled rather than Zod because (a) every other module in this
 *  codebase validates inline, (b) the schema is small and stable,
 *  (c) the failure messages must be Katie-readable so she can
 *  recover. The success type narrows `summary` to required-on-
 *  captured / absent-otherwise so downstream code does not need
 *  unsafe casts. */
function parseUpdateArgs(
  raw: Record<string, unknown>,
):
  | { ok: true; args: UpdateOnboardingStateArgs }
  | { ok: false; error: string } {
  const topic = raw.topic;
  if (
    typeof topic !== "string" ||
    !TOPIC_ORDER.includes(topic as OnboardingTopicId)
  ) {
    return {
      ok: false,
      error: `topic must be one of ${TOPIC_ORDER.join(", ")} (got ${JSON.stringify(topic)})`,
    };
  }
  const status = raw.status;
  if (
    typeof status !== "string" ||
    !VALID_STATUSES.includes(status as OnboardingTopicStatus)
  ) {
    return {
      ok: false,
      error: `status must be one of ${VALID_STATUSES.join(", ")} (got ${JSON.stringify(status)})`,
    };
  }
  // Semantic invariant: status='pending' on the wrap topic has no
  // valid use case (wrap captured is the completion signal; reverting
  // wrap to pending would re-open a finished cascade for no purpose).
  // Reject explicitly so a hallucinated tool call is a loud error
  // rather than a silent bad write — silent-failure-hunter HIGH.
  if (topic === "wrap" && status === "pending") {
    return {
      ok: false,
      error:
        "status='pending' is not valid for the wrap topic — wrap is the terminal step of the cascade.",
    };
  }
  const countRaw = raw.count;
  const count =
    typeof countRaw === "number" && Number.isFinite(countRaw) && countRaw >= 0
      ? Math.floor(countRaw)
      : undefined;
  if (status === "captured") {
    const summary = typeof raw.summary === "string" ? raw.summary : "";
    if (!summary) {
      return {
        ok: false,
        error:
          "summary is required when status='captured' — pass a short user-facing summary of what was captured.",
      };
    }
    return {
      ok: true,
      args: {
        topic: topic as OnboardingTopicId,
        status: "captured",
        summary,
        ...(count !== undefined ? { count } : {}),
      },
    };
  }
  return {
    ok: true,
    args: {
      topic: topic as OnboardingTopicId,
      status: status as "pending" | "skipped" | "deferred",
      ...(count !== undefined ? { count } : {}),
    },
  };
}

/** Build the new topic record from validated args. The discriminated
 *  union on `args.status` means TypeScript narrows `summary` cleanly
 *  inside the `captured` branch — no cast needed. */
function buildTopicRecord(args: UpdateOnboardingStateArgs): OnboardingTopic {
  if (args.status === "captured") {
    return {
      status: "captured",
      summary: args.summary,
      ...(args.count !== undefined ? { count: args.count } : {}),
    };
  }
  return { status: args.status };
}

async function updateOnboardingState(
  rawArgs: Record<string, unknown>,
  ctx: ModuleContext,
): Promise<ToolResult> {
  const parsed = parseUpdateArgs(rawArgs);
  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }
  const { args } = parsed;

  // Read current settings (read-merge-write — see file header).
  // The `eq("user_id", ctx.userId)` predicate is defense-in-depth:
  // `bloombot` has UNIQUE(user_id) so under normal operation it's a
  // no-op (the row matched by id already belongs to the user), but
  // if `ctx.botId` were ever wrong (stale tab, cross-tab pollution,
  // a bug in the context-building layer) the join would miss → no
  // row → readErr → tool fails loudly instead of silently
  // overwriting another user's onboarding state. Per silent-
  // failure-hunter HIGH on cross-bot leakage.
  const { data: current, error: readErr } = await ctx.supabase
    .from("bloombot")
    .select("settings")
    .eq("id", ctx.botId)
    .eq("user_id", ctx.userId)
    .single();
  if (readErr) {
    return {
      success: false,
      error: `Failed to read current settings: ${readErr.message}`,
    };
  }
  // Phantom-null guard: `.single()` should error when no row matches,
  // but defend explicitly so a future Supabase client behaviour
  // change can't silently bootstrap onto a non-existent bot.
  if (!current) {
    return {
      success: false,
      error: `No bloombot row matched id=${ctx.botId} for user — refusing to write.`,
    };
  }

  const existingSettings: BotSettings =
    (current as { settings: BotSettings | null }).settings ?? {};

  const now = new Date().toISOString();
  const baseState: OnboardingState =
    existingSettings.onboarding_state ?? freshInitialState(now);

  // Apply the topic update.
  const nextTopics: OnboardingTopics = {
    ...baseState.topics,
    [args.topic]: buildTopicRecord(args),
  };
  const nextState: OnboardingState = {
    ...baseState,
    last_active_at: now,
    current_step: nextPendingStep(nextTopics),
    topics: nextTopics,
  };

  // Wrap-captured is the one call that flips the completed flag.
  // Spread `existingSettings` first so other keys (waking_hours,
  // effective_role, etc.) survive — the merge MUST NOT replace the
  // settings object wholesale.
  const completedFlip =
    args.topic === "wrap" && args.status === "captured"
      ? { onboarding_completed: true as const }
      : {};

  const mergedSettings: BotSettings = {
    ...existingSettings,
    ...completedFlip,
    onboarding_state: nextState,
  };

  // The trailing `.select().single()` is load-bearing: PostgREST's
  // `.update()` is a no-op (no error) when zero rows match, but
  // `.single()` then fails with PGRST116, which surfaces here as
  // `writeErr`. Removing it would let a wrong-id update succeed
  // silently. Same `eq("user_id", ctx.userId)` defense-in-depth.
  const { error: writeErr } = await ctx.supabase
    .from("bloombot")
    .update({ settings: mergedSettings })
    .eq("id", ctx.botId)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (writeErr) {
    return {
      success: false,
      error: `Failed to update onboarding state: ${writeErr.message}`,
    };
  }

  return {
    success: true,
    data: {
      topic: args.topic,
      status: args.status,
      current_step: nextState.current_step,
      onboarding_completed: mergedSettings.onboarding_completed === true,
    },
  };
}

// ── child.created — proactive welcome trigger ──────────────────────────────
//
// Fires when `createChild` (nanny path) or `createChildAsParent` (parent
// self-add) succeeds. Mode is `template` — instant tier-1 welcome with
// no AI roundtrip. The same trigger handles both first-child + subsequent-
// child variants; the dispatching server action passes
// `is_subsequent: true` in the payload when the user already has at
// least one prior child, and `resolvePayload` picks the variant text.

/** Pull a string field out of an unknown event payload, falling back
 *  to a default if the field is missing or the wrong type. Defensive
 *  because the payload is `Record<string, unknown>` — server actions
 *  set the values but the type system can't guarantee what arrives. */
function payloadString(
  payload: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** Variant 1 — full welcome for a user's FIRST child on this account.
 *  Per A-08 spec § 'Message 1 — Welcome' (lines 200-220). Includes
 *  the trust + privacy preempt and the deferral-first option for
 *  on-shift nannies. The template uses `{var}` placeholders that
 *  `renderTemplate` substitutes from `resolvePayload`'s output. */
const FIRST_CHILD_WELCOME = [
  "✦ Hi {user_first_name} — I'm Katie.",
  "",
  "Baby Bloom is where you and {child_first_name}'s parent stay close to {child_first_name}'s days together. I make your work easier — you tell me what {child_first_name}'s done, I post it for the parent. You ask me for an activity, I plan one. I track {child_first_name}'s development as you go, so you don't have to write reports.",
  "",
  "What you post here, {parent_phrase} sees. It's private to your family.",
  "",
  "What works better right now?",
  "",
  "[I've got a few minutes]   [I'm with {child_first_name} — later]",
].join("\n");

/** Variant 2 — short welcome for a returning user (subsequent child).
 *  Per A-08 spec § 'Subsequent children'. The user already knows the
 *  system; the welcome is brief + offers the same setup. */
const SUBSEQUENT_CHILD_WELCOME = [
  "✦ Hi {user_first_name} — {child_first_name}'s been added. You know the drill — want to set them up the same way? I'll be quick.",
  "",
  "[Let's go]   [I'll do it later]",
].join("\n");

const CHILD_CREATED_TRIGGER: ProactiveTrigger = {
  id: "child.created",
  description:
    "A user added a new child to their account. Fires Katie's introduction-to-the-service welcome — the first message of the A-08 onboarding cascade. Same trigger handles first vs subsequent children; the variant is selected from `event.payload.is_subsequent`.",
  event: "child.created",
  mode: "template",
  // The variant is resolved into a single rendered welcome by
  // `resolvePayload` and substituted via the `{welcome_text}`
  // placeholder. Wrapping in a single placeholder keeps the
  // template a stable string that `renderTemplate` can substitute
  // from the resolved record.
  template: "{welcome_text}",
  resolvePayload: async (event: SiteEvent) => {
    const payload = event.payload;
    const userFirstName = payloadString(payload, "user_first_name", "there");
    const childFirstName = payloadString(
      payload,
      "child_first_name",
      "your child",
    );
    // If BOTH names fell back to placeholders the caller almost
    // certainly sent a broken payload (real createChild always has
    // user_first_name and child_first_name in scope). Log it so the
    // server-action bug is loudly observable rather than silently
    // delivering "Hi there — I'm Katie. ... your child's parent" to
    // a real user. (silent-failure-hunter MEDIUM.)
    if (userFirstName === "there" && childFirstName === "your child") {
      console.warn(
        "[child-onboarding] child.created resolvePayload: both user_first_name and child_first_name missing/empty — caller bug",
      );
    }
    // Parent-name handling: the trust line reads more naturally as
    // "{name} sees" when known, "the parent sees" when not.
    const parentName = payloadString(payload, "parent_first_name_if_known", "");
    const parentPhrase = parentName.length > 0 ? parentName : "the parent";
    // is_subsequent variant detection. Accept both `true` (boolean,
    // expected) and `"true"` (string — defense against JSON-serialised
    // boolean payloads from older callers or future schema drift).
    // Anything else is treated as first-child. Both reviewers HIGH:
    // strict `=== true` would silently pick the wrong variant for
    // returning users.
    const isSubsequent =
      payload.is_subsequent === true || payload.is_subsequent === "true";

    // Render the chosen variant by substituting child + user names
    // BEFORE returning. The trigger template (above) is just
    // `{welcome_text}`, so the dispatcher's renderTemplate sees a
    // single substitution. This keeps name + variant rendering
    // colocated here rather than splitting it across the dispatcher.
    const variantTemplate = isSubsequent
      ? SUBSEQUENT_CHILD_WELCOME
      : FIRST_CHILD_WELCOME;
    const welcomeText = variantTemplate
      .replace(/\{user_first_name\}/g, userFirstName)
      .replace(/\{child_first_name\}/g, childFirstName)
      .replace(/\{parent_phrase\}/g, parentPhrase);

    return { welcome_text: welcomeText };
  },
};

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

  tools: [
    {
      name: "update_onboarding_state",
      description:
        "Update one topic in the onboarding cascade state. Call this after each topic resolves (capture / skip / defer). The wrap topic with status='captured' is the only call that flips bot.settings.onboarding_completed=true and removes the onboarding context from your future prompts.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: TOPIC_ORDER as unknown as string[],
            description:
              "Which topic to update. The valid set comes from the **Onboarding state** table in your runtime header.",
          },
          status: {
            type: "string",
            enum: ["pending", "captured", "skipped", "deferred"],
            description:
              "captured — the user gave input. skipped — the user actively declined (don't re-offer). deferred — the user said 'later' (re-offer in subsequent sessions). pending — usually only used when reverting a write you just made.",
          },
          summary: {
            type: "string",
            description:
              "REQUIRED when status='captured' — short user-facing summary of what was captured (e.g. 'Mon-Fri 8-4'). For other statuses, omit.",
          },
          count: {
            type: "integer",
            description:
              "Optional, only for first_post which can produce 1-3 tiles. Tracks how many were created.",
          },
        },
        required: ["topic", "status"],
      },
    },
  ],

  proactiveTriggers: [CHILD_CREATED_TRIGGER],

  async execute(toolName, args, ctx) {
    if (toolName === "update_onboarding_state") {
      return updateOnboardingState(args, ctx);
    }
    return {
      success: false,
      error: `Unknown tool '${toolName}' on child-onboarding`,
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
