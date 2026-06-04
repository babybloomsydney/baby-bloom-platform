/**
 * Server-side conversion fires — the `signUp.Role.<Role>` calls.
 *
 * Each does ONLY the Meta emit and is fully fail-safe (never throws), so a
 * Meta hiccup can never affect signup / account creation. SERVER ONLY (uses
 * `node:crypto` + the non-public CAPI token via `./capi`).
 *
 * Spec: system/FB/Plan/01-A2-conversion-events-build-plan.md §5a.
 */
import { sendMetaEvent } from "./capi";
import { META_EVENTS, metaContentCategory } from "./events";
import { createAdminClient } from "@/lib/supabase/admin";

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
      // Deterministic per user → a retried signUp dedups on Meta's side.
      eventId: `completeregistration-${input.userId}`,
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

export interface PositionConversionInput {
  parentId: string;
  positionId: string;
  /** Optional path label ("advanced" | "dashboard" | "typeform") for reporting
   *  segmentation — does NOT split Meta's optimization signal. */
  flow?: string;
}

/**
 * `SubmitApplication` — fire for a newly-created parent position (the PRIMARY
 * optimization event). Always `content_category=parent` (positions are
 * parent-only by construction). Looks up the parent's identity (userId + email)
 * for match quality; uses a deterministic `event_id` per position so a
 * double-fire deduplicates. Never throws. Call at the position-creation action
 * (NOT inside `autofireMatchmaking`).
 */
export async function fireParentPositionConversion(
  input: PositionConversionInput,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: parent } = await admin
      .from("parents")
      .select("user_id")
      .eq("id", input.parentId)
      .single();
    // The admin client is untyped (Database type is a placeholder), so the
    // query results are `any` — guard with runtime typeof checks to keep the
    // string|undefined claim honest.
    const rawUserId: unknown = parent?.user_id;
    const userId: string | undefined =
      typeof rawUserId === "string" ? rawUserId : undefined;
    let email: string | undefined;
    if (userId) {
      const { data: profile } = await admin
        .from("user_profiles")
        .select("email")
        .eq("user_id", userId)
        .single();
      const rawEmail: unknown = profile?.email;
      email = typeof rawEmail === "string" ? rawEmail : undefined;
    }
    await sendMetaEvent({
      eventName: META_EVENTS.submitApplication,
      eventId: `submitapplication-${input.positionId}`,
      userData: { email, externalId: userId },
      customData: {
        content_category: "parent",
        ...(input.flow ? { flow: input.flow } : {}),
      },
    });
  } catch (err) {
    console.error(
      "[SubmitApplication] position conversion fire failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
