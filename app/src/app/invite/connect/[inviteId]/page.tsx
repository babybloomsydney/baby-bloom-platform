import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invitesDisabled } from "@/lib/invite/flags";

// Server-only token resolver. The pending-invites dashboard cards key
// on `invite.id` (the row UUID) and never receive the raw token —
// preventing a recipient from harvesting tokens via the UI. This route
// turns an authenticated `(inviteId, recipient_user_id)` lookup into a
// redirect to the public landing.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InviteConnectPage({
  params,
}: {
  params: { inviteId: string };
}) {
  if (invitesDisabled()) redirect("/");

  // Format pre-check — defence-in-depth before the admin-client query.
  // Mirrors the gate in declineChildInviteById so non-UUID probes don't
  // even reach Postgres.
  if (!UUID_REGEX.test(params.inviteId)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/invite/connect/${params.inviteId}`);

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("child_invites")
    .select("token, status, recipient_user_id")
    .eq("id", params.inviteId)
    .maybeSingle();

  // Authorisation: caller MUST be the stamped recipient of the invite.
  // Anything else returns 404 to avoid leaking existence of the row.
  if (!invite || invite.recipient_user_id !== user.id) notFound();
  if (invite.status !== "pending") notFound();

  redirect(`/invite/${invite.token}`);
}
