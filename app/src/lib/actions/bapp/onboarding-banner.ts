"use server";

/**
 * Server actions backing the A-08 "Continue setup with Katie" resume
 * banner — the affordance rendered at the top of `BAppFeedView`.
 *
 * Spec: `system/APP/Ammendments/V 1.1/A-08-katie-guided-onboarding.md`
 * § 'Resume affordance (both user types) — now state-aware' (L763-790).
 *
 * Two responsibilities:
 *   1. `getOnboardingBannerStatus` — read `bloombot.settings` for the
 *      authenticated user, derive whether the banner should render,
 *      and assemble the dynamic copy bits (pending count + label
 *      list + fresh-skip-vs-continue variant).
 *   2. `dismissOnboardingBanner` — flip `onboarding_dismissed = true`
 *      via JSONB read-merge-write so other settings keys (waking
 *      hours, onboarding_state, future flags) are preserved.
 *
 * Both actions are idempotent and safe to call repeatedly. They never
 * throw to the caller — failures resolve with `{ success: false, error }`
 * envelopes so the UI can render a stable state without a broken page.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  BotSettings,
  OnboardingState,
  OnboardingTopicId,
} from "@/types/bapp";

export interface BannerStatus {
  visible: boolean;
  hasCapturedTopics: boolean;
  pendingCount: number;
  pendingTopicLabels: string[];
  /** Total user-visible topics in the cascade (denominator if the UI
   *  ever wants to show "x of N"). */
  totalTopics: number;
}

/**
 * User-visible labels for the topic ids. Kept here and not in the
 * module file so the spec source-of-truth (Katie module) can use
 * the canonical id names (`dev_snapshot`) without leaking that to
 * end users — the spec is explicit that the UI must say
 * "milestones" / "progress", never the topic id.
 */
const TOPIC_LABELS: Record<OnboardingTopicId, string> = {
  welcome: "welcome",
  routine: "routine",
  schedule: "schedule",
  // Spec is explicit: NEVER speak `dev_snapshot` to the user — call it
  // "milestones" or "progress". This is the single source of truth.
  dev_snapshot: "milestones",
  first_post: "first post",
  activity: "activity",
  child_photo: "photo",
  wrap: "wrap",
};

const HIDDEN_BANNER: BannerStatus = {
  visible: false,
  hasCapturedTopics: false,
  pendingCount: 0,
  pendingTopicLabels: [],
  totalTopics: 0,
};

export async function getOnboardingBannerStatus(): Promise<BannerStatus> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return HIDDEN_BANNER;
  }
  // User-scoped client: RLS (`bot_own_access` policy) gates reads to
  // the caller's own bot row. No reason to use the admin client here
  // since we only ever care about the authenticated user's own bot.
  const { data: bot, error } = await supabase
    .from("bloombot")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle<{ settings: BotSettings | null }>();
  if (error) {
    console.warn(
      "[onboarding-banner] bloombot read failed; hiding banner:",
      error.code,
    );
    return HIDDEN_BANNER;
  }
  if (!bot) {
    // Fresh user — no bot yet. Banner only appears post-cascade-init.
    return HIDDEN_BANNER;
  }

  const settings = (bot.settings ?? {}) as BotSettings;
  if (settings.onboarding_completed === true) return HIDDEN_BANNER;
  if (settings.onboarding_dismissed === true) return HIDDEN_BANNER;

  const state = settings.onboarding_state;
  if (!state || !state.topics) return HIDDEN_BANNER;

  // Build pending list. We treat `pending` as the only "still
  // available" status — `skipped` and `deferred` are intentional
  // user choices that the banner shouldn't nag on.
  const pendingIds: OnboardingTopicId[] = [];
  let capturedCount = 0;
  const totalTopics = Object.keys(state.topics).length;
  const topics = state.topics as OnboardingState["topics"];
  for (const [id, topic] of Object.entries(topics)) {
    if (!topic) continue;
    if (topic.status === "pending") {
      pendingIds.push(id as OnboardingTopicId);
    } else if (topic.status === "captured") {
      capturedCount += 1;
    }
  }
  if (pendingIds.length === 0) {
    // Nothing left to nudge on — suppress the banner. The cascade is
    // effectively done from a "more available" UI perspective even if
    // onboarding_completed is still false (e.g. user skipped + paused).
    return HIDDEN_BANNER;
  }

  return {
    visible: true,
    hasCapturedTopics: capturedCount > 0,
    pendingCount: pendingIds.length,
    pendingTopicLabels: pendingIds.map((id) => TOPIC_LABELS[id] ?? id),
    totalTopics,
  };
}

interface DismissResult {
  success: boolean;
  error?: string;
}

export async function dismissOnboardingBanner(): Promise<DismissResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "not_authenticated" };
  }
  // User-scoped client + RLS as defense-in-depth, same as the read
  // path. Read-merge-write JSONB pattern mirrors
  // katie-scheduling.ts L381-405 + child-onboarding.ts updateOnboardingState.
  //
  // Known race: a concurrent `update_onboarding_state` call can
  // overlap and have its topic-state advance overwritten by this
  // dismiss snapshot. Worst-case is Katie re-asks already-captured
  // questions on the next turn — recoverable, not data-corrupting.
  // The flat `onboarding_dismissed` boolean here only changes one
  // top-level key, so the race surface is narrow.
  const { data: bot, error: readErr } = await supabase
    .from("bloombot")
    .select("id, settings")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; settings: BotSettings | null }>();
  if (readErr) {
    console.warn(
      "[onboarding-banner] bloombot read failed during dismiss:",
      readErr.code,
    );
    return { success: false, error: "read_failed" };
  }
  if (!bot) {
    return { success: false, error: "bot_not_found" };
  }
  const merged: BotSettings = {
    ...((bot.settings ?? {}) as BotSettings),
    onboarding_dismissed: true,
  };
  // Dual-predicate update — the SELECT already filtered by user_id,
  // but the UPDATE re-asserts ownership at the DB layer so a tainted
  // bot.id (defensive) cannot reach another user's row. Mirrors the
  // pattern used by updateOnboardingState (child-onboarding.ts).
  const { error: updateErr } = await supabase
    .from("bloombot")
    .update({ settings: merged })
    .eq("id", bot.id)
    .eq("user_id", user.id);
  if (updateErr) {
    console.warn(
      "[onboarding-banner] bloombot update failed during dismiss:",
      updateErr.code,
    );
    return { success: false, error: "update_failed" };
  }
  return { success: true };
}
