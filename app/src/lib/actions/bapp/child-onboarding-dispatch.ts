/**
 * Server-side helpers for the A-08 child-onboarding cascade.
 *
 * Two responsibilities:
 *   1. Insert the celebration tile that lands in the feed
 *      synchronously when a child is created. Atomicity contract per
 *      A-08 spec § 'Architecture' — failure of this insert fails the
 *      caller's child-creation server action so the user never sees
 *      an empty feed.
 *   2. Dispatch the `child.created` proactive trigger that fires
 *      Katie's tier-1 template welcome onto the user's bot. Fire-and-
 *      forget; a dispatch failure must NOT propagate back to the
 *      server action because the cascade is recoverable via the
 *      resume banner if the welcome message fails to land.
 *
 * Lives in `src/lib/actions/bapp/` (alongside child-clients.ts) so
 * the dispatch policy stays close to the action that triggers it.
 * Pulled into its own file because `child-clients.ts` already
 * exceeds the 800-line file-size ceiling — adding the dispatch
 * inline would push it further over.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchActionTriggeredInBackground } from "@/lib/chat/proactive/action-triggered";

interface CelebrationTileInput {
  admin: SupabaseClient;
  childClientId: string;
  authorId: string;
  childFirstName: string;
}

interface CelebrationTileResult {
  ok: boolean;
  error?: string;
}

/**
 * Inserts a `custom`-typed bapp_log row that renders as a celebration
 * tile in the feed. Synchronous: the caller awaits the result and
 * fails its own action on a non-ok return. The data shape mirrors
 * what `feed-writer.ts` produces for Katie-authored custom tiles —
 * heading, text, icon, color — so the existing CustomTile renderer
 * picks it up unchanged.
 *
 * Why `type: "custom"` rather than a new enum value: the BAppLogType
 * union (types/bapp.ts) has no `celebration` member, and adding one
 * would require a migration. The `custom` variant already supports
 * the full `{heading, text, icon, color}` data shape and renders
 * identically — sparkles + violet match Baby Bloom's brand.
 */
export async function recordCelebrationTile(
  input: CelebrationTileInput,
): Promise<CelebrationTileResult> {
  const heading = `${input.childFirstName.trim()} has been added to BabyBloom`;
  const text = "Ready to start their journey.";
  // `is_active: true` is explicit (defends against future default-value
  // changes — a silent flip to `false` would render new tiles invisible
  // and the celebration tile is load-bearing for the A-08 contract).
  const { error } = await input.admin.from("bapp_logs").insert({
    child_client_id: input.childClientId,
    author_id: input.authorId,
    type: "custom",
    status: "completed",
    context: "adhoc",
    is_active: true,
    data: {
      heading,
      text,
      icon: "sparkles",
      color: "violet",
    },
  });
  if (error) {
    // Log full error server-side (Postgres code + message + hint), but
    // return an opaque code to the caller — raw Postgres messages can
    // leak schema details (constraint names, column names) that should
    // not be surfaced to the browser.
    console.error("[child-onboarding] celebration tile insert failed:", error);
    return {
      ok: false,
      error: "celebration_tile_failed",
    };
  }
  return { ok: true };
}

interface ChildCreatedDispatchInput {
  /** The user whose bot should receive the welcome — for createChild
   *  this is the nanny (`user.id`), for createChildAsParent the parent. */
  recipientUserId: string;
  /** The newly-created child's id. Goes into payload for downstream
   *  context (e.g. wrap-step link construction inside Katie's tile). */
  childId: string;
  /** Display name for the child — substituted into the welcome
   *  template by the trigger's resolvePayload. */
  childFirstName: string;
  /** Recipient's first name (substituted into the welcome). */
  userFirstName: string;
  /** Child age in months — used for age-gated questions later in
   *  the cascade. Optional because age math from DOB happens in the
   *  server action and we'd rather pass it pre-computed. */
  childAgeMonths?: number;
  /** True when the recipient has already completed onboarding for
   *  a previous child. The trigger picks the lightweight welcome
   *  variant when set. */
  isSubsequent: boolean;
  /** The parent's first name — known on the nanny path only when
   *  the parent has already accepted the invite (rare at the moment
   *  of child creation). Passed through verbatim for the trust line. */
  parentFirstNameIfKnown?: string;
}

/**
 * Fire-and-forget dispatch of the `child.created` proactive trigger.
 *
 * Two layers of failure isolation:
 *   1. `dispatchActionTriggeredInBackground` itself attaches a `.catch`
 *      to the inner promise (see action-triggered.ts L343-347), so any
 *      async rejection from the dispatch chain is logged and absorbed
 *      there — it cannot propagate back to this caller.
 *   2. The try/catch here only catches a *synchronous* throw before
 *      the inner promise is created (e.g. a future bug in the registry
 *      import or in argument validation). We log + swallow so the
 *      child-creation server action stays unaffected.
 */
export function dispatchChildCreated(input: ChildCreatedDispatchInput): void {
  try {
    dispatchActionTriggeredInBackground({
      triggerId: "child.created",
      recipientUserId: input.recipientUserId,
      payload: {
        child_id: input.childId,
        child_first_name: input.childFirstName,
        user_first_name: input.userFirstName,
        is_subsequent: input.isSubsequent,
        ...(input.childAgeMonths !== undefined
          ? { child_age_months: input.childAgeMonths }
          : {}),
        ...(input.parentFirstNameIfKnown !== undefined
          ? { parent_first_name_if_known: input.parentFirstNameIfKnown }
          : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[child-onboarding] dispatchChildCreated threw synchronously:",
      message,
    );
  }
}

interface PriorChildCountInput {
  admin: SupabaseClient;
  /** The user whose prior children we're counting. */
  userId: string;
  /** Which side of the relationship to count on — nannies count by
   *  `nanny_user_id`, parents by `parent_user_id`. */
  side: "nanny" | "parent";
  /** The just-created child's id, EXCLUDED from the count so the
   *  query result represents children created BEFORE this one. */
  excludeChildId: string;
}

/**
 * Counts how many children the user already has (excluding the one
 * just created) so the trigger can pick first-vs-subsequent welcome
 * variant. Defensive: if the count read fails we default to
 * `is_subsequent = false` (full first-child welcome) — better to
 * over-onboard a returning user than to silently drop the cascade.
 */
export async function isUserSubsequentChild(
  input: PriorChildCountInput,
): Promise<boolean> {
  const column = input.side === "nanny" ? "nanny_user_id" : "parent_user_id";
  const { count, error } = await input.admin
    .from("child_client")
    .select("id", { count: "exact", head: true })
    .eq(column, input.userId)
    .neq("id", input.excludeChildId);
  if (error) {
    // Log only the SQLSTATE code — `error.message` can include schema
    // details we do not want in log aggregators. The full error is
    // visible in Supabase server logs if deeper diagnosis is needed.
    console.warn(
      "[child-onboarding] prior-child count failed; defaulting to first-child variant:",
      error.code,
    );
    return false;
  }
  return (count ?? 0) > 0;
}
