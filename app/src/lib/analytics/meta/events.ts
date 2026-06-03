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
 * Custom data sent alongside an event. All optional; Meta ignores unknown
 * keys. `value`/`currency` apply to Purchase; `flow` distinguishes the
 * position-created path ("one_go" vs "later") WITHOUT splitting the
 * optimization signal.
 */
export interface MetaCustomData {
  content_category?: MetaContentCategory;
  currency?: string;
  value?: number;
  flow?: string;
  [key: string]: string | number | undefined;
}
