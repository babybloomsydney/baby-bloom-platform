/**
 * Katie's templated reply when a child-scoped tool hits the paywall
 * gate (S6).
 *
 * Two role-aware variants:
 *
 *   - PARENT — direct subscribe path. Tell them gently, point at the
 *     subscribe button. The modal/banner are also on the page so the
 *     CTA path is reinforced.
 *
 *   - NANNY — relational frame. The nanny can't pay for the parent;
 *     the only action she can take is to share the subscribe link
 *     (via the SubscribeModalNanny). Tell her to nudge them.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S6.
 *
 * Locked-in shape (Cialdini reciprocity through warmth):
 *   - Opens with "I'd love to help" — apologetic, not punitive.
 *   - Names the specific child to ground the limitation in their
 *     real world rather than abstract policy.
 *   - Includes the actionable path forward (subscribe / share).
 *
 * NEVER include "track" / "tracking" / "tracked" — memory rule
 * `feedback_never_use_tracking_terminology`.
 */

import type { BotRole } from "@/lib/ai/model-selector";
import type { ToolResult } from "@/lib/chat/modules/types";

/**
 * Build the ToolResult that runTool returns when the access gate
 * blocks a child-scoped tool. The route's downstream terminal-result
 * handler will surface `error` as the assistant text + break the
 * agentic loop, so further model rounds don't fire.
 */
export function buildKatieSubscriptionRequiredResult(
  effectiveRole: BotRole,
  childFirstName: string,
  parentFirstName: string | null,
): ToolResult {
  const parentRef = parentFirstName ?? "the parent";

  const message =
    effectiveRole === "parent"
      ? `I'd love to help with that, but ${childFirstName} doesn't have an active subscription. Subscribe to continue and I'll be back to full support.`
      : `I'd love to help with that, but ${childFirstName} doesn't have an active subscription. ${parentRef} needs to subscribe to continue.`;

  return {
    success: false,
    error: message,
    terminal: true,
    data: {
      reason: "subscription_required",
      child_name: childFirstName,
      parent_first_name: parentFirstName,
      effective_role: effectiveRole,
    },
  };
}
