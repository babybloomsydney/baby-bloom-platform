/**
 * Shared predicate helpers used by tool-level `isPrefulfilled` hooks.
 *
 * The hooks themselves live on each tool definition (per
 * `Latency:Efficiency/06-implementation-plan.md §WU6`). They share
 * the same shape — "is the data this tool would return already in
 * runtime context?" — so the actual matching logic lives here to
 * keep the per-tool definitions one-line.
 *
 * Spec: 07-test-plan.md §WU6
 */

import type { PreloadedContext, PreloadSlotName } from "./types";

/**
 * The most rows the always-on builder emits per child. The
 * `read_recent_feed` predicate uses this to refuse short-circuiting
 * when Katie asks for more than what's in pre-load.
 *
 * Source of truth: `RECENT_FEED_CAP` in `build-always-on.ts`.
 * Duplicated here to avoid importing from a route-side module
 * (predicates are leaf-level + must stay framework-agnostic). If the
 * builder cap changes, this constant + the test fixtures update too.
 */
export const PRELOAD_RECENT_FEED_CAP = 10;

/**
 * True when the requested child name appears in
 * `preload.children_profiles` (case-insensitive `first_name` match).
 *
 * Returns false when:
 * - `child_name` is missing, not a string, or empty after trim
 * - `preload` is undefined
 * - `preload.children_profiles` is missing or empty
 * - no profile entry matches the requested name
 *
 * Used by `read_child_profile`, `read_milestones`, and (via
 * `isRecentFeedFulfilled`) `read_recent_feed`. The synthetic
 * ToolResult that the route emits when this returns true points
 * Katie back to the runtime "Already loaded for you" block:
 * - children_profiles + children_recent_feeds (always-on builder
 *   populates both together — see `build-always-on.ts`).
 * - developmental_snapshot for the same children (route's
 *   pre-flight `buildDevelopmentalSnapshots` — same `children`
 *   array). This is what makes the `read_milestones` short-circuit
 *   safe: the milestone landscape IS rendered in the runtime
 *   context, just from a different code path than the preload
 *   slots.
 */
export function isChildNameInPreloadProfiles(
  args: Record<string, unknown>,
  preload: PreloadedContext | undefined,
): boolean {
  const childName = args["child_name"];
  if (typeof childName !== "string") return false;
  const trimmed = childName.trim();
  if (!trimmed) return false;
  const profiles = preload?.children_profiles ?? [];
  if (profiles.length === 0) return false;
  const lower = trimmed.toLowerCase();
  return profiles.some(
    (entry) => entry.profile.first_name?.toLowerCase() === lower,
  );
}

/**
 * Strict version of `isChildNameInPreloadProfiles` for
 * `read_recent_feed`. Adds: refuse to short-circuit when Katie's
 * args exceed what the pre-load snapshot can satisfy.
 *
 * The always-on builder ships at most `PRELOAD_RECENT_FEED_CAP`
 * UNFILTERED entries per child. So if Katie requests:
 *   - `type_filter: "diary"` (or any specific type), the snapshot
 *     may have zero matching rows — the real handler must run.
 *   - `limit > PRELOAD_RECENT_FEED_CAP`, the snapshot can't satisfy
 *     it — the real handler must run.
 *
 * Reported by silent-failure-hunter on WU6 (HIGH-2).
 */
export function isRecentFeedFulfilled(
  args: Record<string, unknown>,
  preload: PreloadedContext | undefined,
): boolean {
  if (args["type_filter"] !== undefined) return false;
  const requestedLimit = args["limit"];
  if (
    typeof requestedLimit === "number" &&
    requestedLimit > PRELOAD_RECENT_FEED_CAP
  ) {
    return false;
  }
  return isChildNameInPreloadProfiles(args, preload);
}

/**
 * True when `preload.my_profile_basics` is a populated object.
 *
 * Returns false when the slot is undefined, null, or otherwise
 * falsy (defensive — verifier should reject malformed slots, but
 * the predicate is a safety net so a hypothetical buggy publisher
 * passing `null` doesn't trigger a false positive).
 *
 * Used by `read_my_profile`. Signature accepts `args` even though
 * unused — keeps the function directly assignable to
 * `ToolDefinition.isPrefulfilled` without a wrapper arrow (per
 * typescript-reviewer MEDIUM on WU6).
 */
export function isMyProfilePresent(
  _args: Record<string, unknown>,
  preload: PreloadedContext | undefined,
): boolean {
  return Boolean(preload?.my_profile_basics);
}

/**
 * Returns a predicate that's true when the named slot is present.
 *
 * Per the 2026-05-09 amendment (`03-design-decisions.md §D-04`),
 * `connection_inbox` and `verification_status` are NOT populated by
 * the always-on builder — only by surface-specific publishers (the
 * inbox or verification page). When the user is on that page, the
 * publisher fills the slot and Katie's read tool short-circuits.
 *
 * Off-page, the slot is absent and the tool runs as normal.
 *
 * `pending_count: 0` still counts as "fulfilled" — the answer ("0
 * pending") is the answer; the verifier is what gates whether the
 * slot is honoured at all.
 *
 * Used by `read_connection_inbox`, `read_verification_status`.
 * Returns a function so it can be assigned directly to
 * `ToolDefinition.isPrefulfilled`.
 */
export function makeSlotPresentPredicate(
  slot: Extract<PreloadSlotName, "connection_inbox" | "verification_status">,
): (
  args: Record<string, unknown>,
  preload: PreloadedContext | undefined,
) => boolean {
  return (_args, preload) => Boolean(preload?.[slot]);
}
