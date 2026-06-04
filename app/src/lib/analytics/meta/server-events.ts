/**
 * Server-side conversion fires — the `signUp.Role.<Role>` calls.
 *
 * Each does ONLY the Meta emit and is fully fail-safe (never throws), so a
 * Meta hiccup can never affect signup / account creation. SERVER ONLY (uses
 * `node:crypto` + the non-public CAPI token via `./capi`).
 *
 * Spec: system/FB/Plan/01-A2-conversion-events-build-plan.md §5a.
 */
import { randomUUID } from "node:crypto";
import { sendMetaEvent } from "./capi";
import { META_EVENTS, metaContentCategory } from "./events";

/** Raw identity for a new account (PII hashing happens downstream in `./capi`). */
export interface SignupConversionInput {
  /** The role assigned to `user_roles` ("parent" | "nanny"). */
  role: string;
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * `signUp.Role.Parent` / `signUp.Role.Nanny` — fire a Meta `CompleteRegistration`
 * for a newly-created account, tagged `content_category` from the role. No-op
 * for non-audience roles (e.g. `admin`). Never throws.
 */
export async function fireSignupConversion(
  input: SignupConversionInput,
): Promise<void> {
  try {
    const content_category = metaContentCategory(input.role);
    if (!content_category) return; // admin / unknown — not a conversion audience
    await sendMetaEvent({
      eventName: META_EVENTS.completeRegistration,
      eventId: randomUUID(),
      userData: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        externalId: input.userId,
      },
      customData: { content_category },
    });
  } catch (err) {
    console.error(
      "[signUp.Role] CompleteRegistration fire failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
