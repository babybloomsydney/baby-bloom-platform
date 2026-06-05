/**
 * Meta (Facebook) conversion event contract — shared between the browser
 * pixel wrapper (`./browser`) and the server Conversions API helper
 * (`./capi`). Defining the names + shapes in one isomorphic module keeps
 * the browser and CAPI copies of the same event in lockstep so they
 * deduplicate on Meta's side via a shared `event_id`.
 *
 * Isomorphic + side-effect-free: safe to import from client or server.
 *
 * Spec: system/FB/Conversion Events/ +
 * system/FB/Plan/01-A-pixel-setup-build-plan.md (Task A).
 */

/** The four conversion events instrumented in Task A. */
export const META_EVENTS = {
  /** Anonymous quick-match completion (browser-led; weak match / retarget). */
  quickMatchCompleted: "QuickMatchCompleted",
  /** Account created — fired server-side from `signUp()` where role is known. */
  completeRegistration: "CompleteRegistration",
  /** Parent position created — the PRIMARY optimization event. */
  submitApplication: "SubmitApplication",
  /** Paid plan purchased — fired server-side from the Stripe webhook. */
  purchase: "Purchase",
} as const;

export type MetaEventName = (typeof META_EVENTS)[keyof typeof META_EVENTS];

/**
 * Drives Meta `content_category` so nanny signups never enter the parent
 * Custom Conversions. Derived server-side from the real signup role.
 */
export type MetaContentCategory = "parent" | "nanny";

/**
 * The single parent/nanny differentiator: maps a user role → the Meta
 * `content_category` tag. This is the ONE place that decision is made — never
 * derive role from a URL/page. Returns `null` for non-audience roles (e.g.
 * `admin`) so the caller fires nothing.
 */
export function metaContentCategory(role: string): MetaContentCategory | null {
  if (role === "parent") return "parent";
  if (role === "nanny") return "nanny";
  return null;
}

/**
 * Custom data sent alongside an event. All optional; Meta ignores unknown
 * keys. `value`/`currency` apply to Purchase; `flow` labels the path that
 * created the conversion (positions: "dashboard" | "typeform" | "advanced")
 * for reporting segmentation, WITHOUT splitting the optimization signal.
 *
 * No index signature — keeping the fields named catches typos (a misspelled
 * key would otherwise be silently forwarded + dropped by Meta).
 */
export interface MetaCustomData {
  content_category?: MetaContentCategory;
  currency?: string;
  value?: number;
  flow?: string;
}
