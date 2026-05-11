import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import { InviteBanner } from "@/components/bapp/InviteBanner";
import { getInviteForChild } from "@/lib/actions/bapp/child-invites";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";
import type { ChildClient } from "@/types/bapp";

export default async function ParentDevelopmentLayout({
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

  if (error || !child) redirect("/parent");

  // Verify parent has access
  const c = child as ChildClient;
  if (c.parent_user_id !== user.id) {
    redirect("/parent");
  }

  // Banner shows when the parent created the invite (parent_to_nanny)
  // and the nanny hasn't claimed it yet. getInviteForChild gates on
  // creator-only access, so a child with a nanny-created invite won't
  // expose the token here.
  const showBanner = c.nanny_user_id === null;
  const inviteResult = showBanner ? await getInviteForChild(c.id) : null;

  // S4 — paywall gate. When the family lacks access, BAppLayout swaps
  // the FAB action into the SubscribeModal trigger + renders the
  // LapsedBanner above page content. Trial state has access; lapsed /
  // cancelled-after-period do not.
  const access = await requireChildFamilyAccess(c.id);

  // Fetch nanny first name for the modal's locked-in copy. Cheap
  // single-row lookup; can be skipped when access is granted.
  let nannyFirstName: string | undefined;
  if (!access.hasAccess && c.nanny_user_id) {
    const { data: nannyProfile } = await admin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", c.nanny_user_id)
      .maybeSingle<{ first_name: string | null }>();
    nannyFirstName = nannyProfile?.first_name ?? undefined;
  }

  return (
    <BAppLayout
      child={c}
      role="parent"
      familyHasAccess={access.hasAccess}
      nannyFirstName={nannyFirstName}
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
          role="parent"
        />
      )}
      {children}
    </BAppLayout>
  );
}
