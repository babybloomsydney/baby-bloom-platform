/**
 * /subscribe-for/[token] — public landing for nanny-shared subscribe
 * invites (S5).
 *
 * The nanny shares this URL via Web Share / clipboard from the
 * SubscribeModalNanny. Parent clicks the link → this page resolves
 * the token to the underlying child + nanny + parent, gates on the
 * parent being signed in as the correct user, and redirects to the
 * canonical Subscribe page with `?via=nanny-invite` so the page
 * renders its personalised header.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S5.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSubscribeInviteToken } from "@/lib/payments/subscribe-invite-token";

interface PageProps {
  params: { token: string };
}

interface InviteRow {
  token: string;
  child_client_id: string;
  parent_user_id: string;
  nanny_user_id: string;
  status: "pending" | "redeemed" | "expired" | "revoked";
}

export default async function SubscribeForLandingPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const { token } = params;

  // Token format validation — malformed tokens never hit Postgres.
  if (!isValidSubscribeInviteToken(token)) {
    return <InvalidLinkPage reason="malformed" />;
  }

  // Look up the invite via admin client. Token format guard above
  // is the rate-limit defence-in-depth.
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("subscribe_invites")
    .select("token, child_client_id, parent_user_id, nanny_user_id, status")
    .eq("token", token)
    .maybeSingle<InviteRow>();

  if (error || !invite) {
    return <InvalidLinkPage reason="not_found" />;
  }
  if (invite.status === "revoked") {
    return <InvalidLinkPage reason="revoked" />;
  }
  if (invite.status === "expired") {
    return <InvalidLinkPage reason="expired" />;
  }
  if (invite.status === "redeemed") {
    // The link has already been used (parent already completed
    // Checkout with this token). A second arrival here would
    // otherwise route to /parent/subscribe and offer the plan picker
    // again — confusing if the family already has an active
    // subscription, and wasted DB roundtrip if they don't.
    return <InvalidLinkPage reason="redeemed" />;
  }

  // Auth check. Unauth'd users return after signin via `?next=`.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(`/subscribe-for/${token}`);
    redirect(`/login?next=${next}`);
  }

  // Wrong-account guard. The invite is for a specific parent; signing
  // in as the nanny or as some other parent should NOT silently
  // route to checkout.
  if (user.id !== invite.parent_user_id) {
    return <WrongAccountPage />;
  }

  // Happy path — route to the canonical Subscribe page with the
  // nanny-invite query params. S7 picks these up and renders the
  // personalised header. Token is forwarded so S7 can mark the
  // invite redeemed on successful Checkout.
  const childId = encodeURIComponent(invite.child_client_id);
  redirect(
    `/parent/subscribe?childId=${childId}&via=nanny-invite&inviteToken=${encodeURIComponent(token)}`,
  );
}

function InvalidLinkPage({
  reason,
}: {
  reason: "malformed" | "not_found" | "revoked" | "expired" | "redeemed";
}): JSX.Element {
  const copy = (() => {
    switch (reason) {
      case "malformed":
        return "This link doesn't look right. Ask your nanny to share it again.";
      case "not_found":
        return "We couldn't find this link. Ask your nanny to share it again.";
      case "revoked":
        return "This link has been revoked. Ask your nanny to share a fresh one.";
      case "expired":
        return "This link has expired. Ask your nanny to share a fresh one.";
      case "redeemed":
        return "This link has already been used. Your subscription should be active in your dashboard.";
      default:
        return "This link is no longer valid.";
    }
  })();
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Link not available</h1>
      <p className="text-base text-slate-600">{copy}</p>
      <Link
        href="/parent"
        className="text-sm font-medium text-violet-600 underline-offset-2 hover:underline"
      >
        Go to your dashboard
      </Link>
    </main>
  );
}

function WrongAccountPage(): JSX.Element {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">
        This link is for a different account
      </h1>
      <p className="text-base text-slate-600">
        You&apos;re signed in with an account that isn&apos;t the recipient of
        this invite. Sign out and sign in with the email the link was sent to.
      </p>
      <Link
        href="/logout"
        className="text-sm font-medium text-violet-600 underline-offset-2 hover:underline"
      >
        Sign out
      </Link>
    </main>
  );
}
