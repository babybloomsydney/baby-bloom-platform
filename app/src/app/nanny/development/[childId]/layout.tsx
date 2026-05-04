import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import { InviteBanner } from "@/components/bapp/InviteBanner";
import { getInviteForChild } from "@/lib/actions/bapp/child-invites";
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

  return (
    <BAppLayout child={c} role="nanny">
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
