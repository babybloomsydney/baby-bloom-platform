import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import { InviteBanner } from "@/components/bapp/InviteBanner";
import { getInviteForChild } from "@/lib/actions/bapp/child-invites";
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

  return (
    <BAppLayout child={c} role="parent">
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
