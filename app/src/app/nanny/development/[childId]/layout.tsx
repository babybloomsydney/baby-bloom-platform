import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import { InviteBanner } from "@/components/bapp/InviteBanner";
import { getInviteForChild } from "@/lib/actions/bapp/child-invites";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";
import { createSubscribeInvite } from "@/lib/actions/payments/createSubscribeInvite";
import { getSubscriptionStateForChild } from "@/lib/payments/subscription-state-for-child";
import type { ChildClient } from "@/types/bapp";

export default async function DevelopmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { childId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();

  // Fetch child and verify access
  const { data: child, error } = await admin
    .from("child_client")
    .select("*")
    .eq("id", params.childId)
    .single();

  if (error || !child) redirect("/nanny");

  // Verify user has access (nanny or parent)
  const c = child as ChildClient;
  if (c.nanny_user_id !== user.id && c.parent_user_id !== user.id) {
    redirect("/nanny");
  }

  // Banner shows on the nanny side when the parent hasn't claimed yet.
  // getInviteForChild authorises by creator, so a parent visiting a
  // shared child layout won't see the token via this surface.
  const showBanner = c.nanny_user_id === user.id && c.parent_user_id === null;
  const inviteResult = showBanner ? await getInviteForChild(c.id) : null;

  // S4 + S5 — paywall gate. When the family lacks access (parent
  // hasn't subscribed / trial expired / cancelled past period end),
  // BAppLayout swaps the FAB action into the SubscribeModalNanny
  // trigger + renders the LapsedBanner above page content. The modal
  // needs a pre-minted nanny-share invite (S5) to render its share
  // CTA. We mint it here so the modal can fire instantly on FAB tap.
  // Resolve access state + the underlying subscription state in
  // parallel. The pill needs the underlying status to label trial /
  // active / cancelled-in-period / past-due (UX-FIX-PLAN FIX-8).
  const [access, subscriptionState] = await Promise.all([
    requireChildFamilyAccess(c.id),
    getSubscriptionStateForChild(c.id),
  ]);

  let nannyShareUrl: string | undefined;
  let nannyShareText: string | undefined;
  let parentFirstName: string | undefined;
  if (
    !access.hasAccess &&
    c.parent_user_id !== null &&
    c.nanny_user_id === user.id
  ) {
    const inviteRes = await createSubscribeInvite(c.id);
    if (inviteRes.success) {
      nannyShareUrl = inviteRes.data.url;
      nannyShareText = inviteRes.data.shareText;
    }
    const { data: parentProfile } = await admin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", c.parent_user_id)
      .maybeSingle<{ first_name: string | null }>();
    parentFirstName = parentProfile?.first_name ?? undefined;
  }

  return (
    <BAppLayout
      child={c}
      role="nanny"
      familyHasAccess={access.hasAccess}
      parentFirstName={parentFirstName}
      nannyShareUrl={nannyShareUrl}
      nannyShareText={nannyShareText}
      subscriptionState={subscriptionState}
      lapseReason={
        access.reason === "trial_expired"
          ? "trial_ended"
          : "subscription_lapsed"
      }
    >
      {inviteResult?.success && inviteResult.data && (
        <InviteBanner
          childId={c.id}
          childFirstName={c.first_name ?? "your child"}
          inviteUrl={inviteResult.data.url}
          role="nanny"
        />
      )}
      {children}
    </BAppLayout>
  );
}
