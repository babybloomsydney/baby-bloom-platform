/**
 * Katie access gate — S6 (subscription paywall enforcement).
 *
 * Layered at the chat-route's runTool dispatcher. When a tool whose
 * module is marked `childScoped: true` is invoked, the gate:
 *
 *   1. Resolves the `child_name` argument to a child id via the same
 *      ctx.children list the tool would have used.
 *   2. Calls `requireChildFamilyAccess(childId)` — the shared paywall
 *      check used by every bapp_logs write action (Phase 5).
 *   3. If access is denied, returns a structured ToolResult with
 *      `error: "subscription_required"` and the child + parent first
 *      names interpolated. The chat route detects this error and
 *      streams a templated assistant message (no further model call).
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S6.
 *
 * Why a chokepoint (not per-module wraps):
 *   - All 9 child-scoped Katie modules already funnel through
 *     `resolveChild(args.child_name, ctx.children)`. Gating at the
 *     module-flag level means one chokepoint enforces all of them
 *     plus any future child-scoped module — no per-module audit
 *     burden.
 *   - Defense-in-depth: Phase 5 access-gate already blocks server
 *     writes; this layer blocks the Katie path BEFORE the handler
 *     runs, so the user gets the templated response rather than
 *     an opaque "operation failed."
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";
import { resolveChild } from "@/lib/chat/modules/utils";
import type { ChildSummary, ToolResult } from "@/lib/chat/modules/types";

/**
 * Outcome of the gate check. Discriminated union — the chat route
 * branches on `result.kind` and either lets the tool run (ok) or
 * returns the ToolResult directly (blocked).
 */
export type ChildAccessGateOutcome =
  | { kind: "ok" }
  /** No `child_name` in args — tool isn't tied to a specific child
   *  (e.g. a list-all-children read). Lets the tool run; if the
   *  tool decides to access a specific child it must check itself. */
  | { kind: "no_child_arg" }
  /** child_name couldn't be resolved to a child the user has
   *  access to. resolveChild already returns a friendly error
   *  ToolResult — we forward it unchanged so Katie's UX is
   *  consistent with the pre-gate behaviour. */
  | { kind: "unresolvable"; result: ToolResult }
  /** Child resolved AND lapsed — emit the subscription_required
   *  result. Chat route uses this to short-circuit + emit the
   *  templated assistant reply with parent + child names. */
  | {
      kind: "blocked";
      result: ToolResult;
      childFirstName: string;
      parentFirstName: string | null;
    };

/**
 * Run the gate for a tool call. Caller (chat route) only invokes
 * this when the tool's module has `childScoped: true`.
 *
 * The function reads `args.child_name`; modules that resolve a
 * child by a different arg name should be excluded from this
 * gate (don't set `childScoped` on them) and gate themselves.
 */
export async function gateChildScopedTool(
  args: Record<string, unknown>,
  children: ChildSummary[],
  supabase: SupabaseClient,
): Promise<ChildAccessGateOutcome> {
  // Modules with childScoped: true may still be called without a
  // child_name on some tools (e.g. a future list_my_children).
  // Bail out cleanly so those tools aren't broken.
  if (typeof args.child_name !== "string" || args.child_name.length === 0) {
    return { kind: "no_child_arg" };
  }

  const resolution = resolveChild(args.child_name, children);
  if (resolution.error) {
    return { kind: "unresolvable", result: resolution.error };
  }

  const childId = resolution.child.id;
  const gate = await requireChildFamilyAccess(childId);
  if (gate.hasAccess) {
    return { kind: "ok" };
  }

  // Lapsed family — block + fetch parent name for the templated
  // response. Failing parent-name lookup is non-fatal; the
  // response falls back to "their parent" copy.
  const parentFirstName = await fetchParentFirstName(supabase, childId);

  return {
    kind: "blocked",
    result: {
      success: false,
      error: "subscription_required",
      data: {
        child_name: resolution.child.firstName,
        parent_first_name: parentFirstName,
      },
      terminal: true,
    },
    childFirstName: resolution.child.firstName,
    parentFirstName,
  };
}

async function fetchParentFirstName(
  supabase: SupabaseClient,
  childId: string,
): Promise<string | null> {
  const { data: child } = await supabase
    .from("child_client")
    .select("parent_user_id")
    .eq("id", childId)
    .maybeSingle<{ parent_user_id: string | null }>();
  if (!child?.parent_user_id) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name")
    .eq("user_id", child.parent_user_id)
    .maybeSingle<{ first_name: string | null }>();
  return profile?.first_name ?? null;
}
