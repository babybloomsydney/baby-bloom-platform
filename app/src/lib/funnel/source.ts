/**
 * Funnel-source URL contract for the parent onboarding path.
 *
 * `?src=std|adv&lead=<uuid?>` is the contract the parent funnel uses
 * to thread its origin from `/results` (quick-match) or
 * `/matchmaking/results` (advanced) through `/nannies/[id]`, the Connect
 * button, the signup form, and analytics. Defined here so every reader
 * shares the same parse + fall-back semantics.
 *
 * See: `system/forms/Parent onboarding/PLAN.md` §URL-contract.
 */

export type FunnelSource = "std" | "adv";

/**
 * Parse the `?src=` param into the closed-set type. Unknown values fall
 * back to `null` (caller treats as "no source signal — render legacy chrome").
 *
 * The signature accepts the union of shapes that the Next.js
 * `searchParams` object (server) and `URLSearchParams.get()` (client)
 * each return, so callers can pass the raw value through.
 */
export function parseFunnelSource(
  raw: string | string[] | null | undefined,
): FunnelSource | null {
  if (raw === "std" || raw === "adv") return raw;
  return null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse the `?lead=` param into a validated UUID. Anything else falls back
 * to `null` (Connect targets `/matchmaking/signup` without `?lead=`; signup
 * still works but has no lead to convert).
 *
 * Accepts the same wider union as `parseFunnelSource` so server +
 * client call sites can hand the raw value through unchanged.
 */
export function parseFunnelLead(
  raw: string | string[] | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  return UUID_REGEX.test(raw) ? raw : null;
}

/**
 * Map a `FunnelSource` to the corresponding `signupSource` value the
 * `parents` row stores for attribution. Co-located here so the closed-set
 * type stays the single source of truth — adding a new `FunnelSource`
 * member forces the caller to extend this map.
 */
export function funnelSourceToSignupSource(src: FunnelSource): string {
  switch (src) {
    case "std":
      return "standard_match";
    case "adv":
      return "advanced_match";
  }
}
