import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSubscribeInviteToken } from "@/lib/payments/subscribe-invite-token";
import { SubscribeClient } from "./SubscribeClient";

/**
 * Parent Subscribe page — pricing reveal + plan chooser (S7).
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S7.
 *
 * Server component:
 *   - Authenticates the user
 *   - Reads `?childId=`, `?via=nanny-invite`, `?inviteToken=` params
 *   - When `via=nanny-invite`, resolves the nanny + child first names
 *     for the personalised header
 *   - Looks up the parent's current subscription state (to show the
 *     trial banner if eligible)
 *   - Bounces already-subscribed parents to /parent/subscription
 *
 * The client component handles the actual plan-chooser + Checkout
 * redirect.
 */

interface SubscribeContext {
  nannyFirstName: string;
  childFirstName: string;
}

export default async function ParentSubscribePage({
  searchParams,
}: {
  searchParams: { childId?: string; via?: string; inviteToken?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent("/parent/subscribe");
    redirect(`/login?next=${next}`);
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("parent_subscriptions")
    .select("status, has_used_trial")
    .eq("parent_user_id", user.id)
    .maybeSingle<{
      status:
        | "trial"
        | "active_monthly"
        | "active_upfront"
        | "past_due"
        | "cancelled"
        | "lapsed"
        | null;
      has_used_trial: boolean | null;
    }>();

  // Already on a paid plan — bounce to the management page; they
  // can cancel from there. Trial users are intentionally NOT treated
  // as "active" here (DSS Q1, Bailey 2026-05-12): they MUST be able
  // to pick a paid plan during trial so it locks in for when the
  // trial ends. Bailey 2026-05-13: prior "trial counts as active"
  // logic caused the "Continue Development" CTA to redirect back to
  // /parent/subscription in a loop.
  const isPaidActive =
    sub?.status === "active_monthly" ||
    sub?.status === "active_upfront" ||
    sub?.status === "past_due";

  if (isPaidActive) {
    redirect("/parent/subscription");
  }

  const trialAvailable = !sub?.has_used_trial;

  // Personalised-header context when arriving via a nanny share link.
  // Validate the token format BEFORE any DB lookup so malformed
  // values (typos, fuzz, attempted injection) never hit Postgres.
  let nannyContext: SubscribeContext | null = null;
  if (
    searchParams.via === "nanny-invite" &&
    typeof searchParams.inviteToken === "string" &&
    isValidSubscribeInviteToken(searchParams.inviteToken)
  ) {
    nannyContext = await resolveNannyContext(searchParams.inviteToken, user.id);
  }

  return (
    <SubscribeClient
      trialAvailable={trialAvailable}
      nannyContext={nannyContext}
    />
  );
}

/**
 * Looks up the inviting nanny's first name + the linked child's
 * first name for the personalised header. Only returns a context
 * if the invite is pending AND belongs to the currently-signed-in
 * parent — wrong-account guards happen at /subscribe-for, but
 * we re-check here as defence-in-depth.
 */
async function resolveNannyContext(
  token: string,
  parentUserId: string,
): Promise<SubscribeContext | null> {
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("subscribe_invites")
    .select("child_client_id, nanny_user_id, parent_user_id, status")
    .eq("token", token)
    .maybeSingle<{
      child_client_id: string;
      nanny_user_id: string;
      parent_user_id: string;
      status: "pending" | "redeemed" | "expired" | "revoked";
    }>();
  if (!invite) return null;
  if (invite.parent_user_id !== parentUserId) return null;
  if (invite.status !== "pending") return null;

  const { data: nanny } = await admin
    .from("user_profiles")
    .select("first_name")
    .eq("user_id", invite.nanny_user_id)
    .maybeSingle<{ first_name: string | null }>();
  const { data: child } = await admin
    .from("child_client")
    .select("first_name")
    .eq("id", invite.child_client_id)
    .maybeSingle<{ first_name: string | null }>();

  if (!nanny?.first_name || !child?.first_name) return null;
  return {
    nannyFirstName: nanny.first_name,
    childFirstName: child.first_name,
  };
}
