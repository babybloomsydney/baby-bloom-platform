"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  connectChildInvite,
  declineChildInvite,
} from "@/lib/actions/bapp/child-invites";
import { deriveInviteState, type InviteState } from "@/lib/invite/state";
import type { ChildInvitePreview } from "@/types/bapp";
import type { UserRole } from "@/lib/auth/types";

interface InviteLandingClientProps {
  token: string;
  preview: ChildInvitePreview | null;
  previewError: string | null;
  currentUserId: string | null;
  currentUserRole: UserRole | null;
}

export function InviteLandingClient(props: InviteLandingClientProps) {
  const router = useRouter();
  // The connect server action can return role_mismatch /
  // invite_already_connected after the page loaded — we override the
  // derived state when that happens so the user sees the right surface
  // without a full reload.
  const [override, setOverride] = useState<InviteState | null>(null);
  const [busy, setBusy] = useState<"connect" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseState = deriveInviteState({
    preview: props.preview,
    previewError: props.previewError,
    currentUserId: props.currentUserId,
    currentUserRole: props.currentUserRole,
  });
  const state = override ?? baseState;

  async function handleConnect() {
    if (state.kind !== "ready_to_connect") return;
    setBusy("connect");
    setError(null);
    const result = await connectChildInvite(props.token);
    if (result.success && result.data) {
      // Clear busy BEFORE the navigation begins — router.push is async,
      // and stranding `busy` keeps both buttons disabled in the
      // post-success render tick (visible in jsdom test environments).
      setBusy(null);
      router.push(`/${state.expectedRole}/development/${result.data.childId}`);
      return;
    }
    // Map error envelopes back into UI state.
    if (result.error === "role_mismatch") {
      setOverride({
        kind: "wrong_role",
        preview: state.preview,
        expectedRole: state.expectedRole,
        currentRole: props.currentUserRole,
      });
    } else if (result.error === "invite_already_connected") {
      setOverride({ kind: "already_connected", preview: state.preview });
    } else if (result.error === "invite_revoked") {
      setOverride({ kind: "revoked", preview: state.preview });
    } else if (result.error === "invite_not_found") {
      setOverride({ kind: "not_found" });
    } else {
      setError("Something went wrong. Please try again.");
    }
    setBusy(null);
  }

  async function handleDecline() {
    if (state.kind !== "ready_to_connect") return;
    setBusy("decline");
    setError(null);
    const result = await declineChildInvite(props.token);
    if (!result.success) {
      // Surface a generic message rather than silently routing away.
      // The decline action is best-effort: on conflict we show feedback
      // but stay on the page so the user can retry or close the tab.
      setError(
        result.error === "invite_not_found"
          ? "This invite is no longer available."
          : "Couldn't decline. Please try again.",
      );
      setBusy(null);
      return;
    }
    setBusy(null);
    router.push(`/${state.expectedRole}`);
  }

  return (
    <div className="space-y-6">
      <Surface state={state} />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {state.kind === "ready_to_connect" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={handleConnect}
            disabled={busy !== null}
            className="flex-1"
          >
            {busy === "connect" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDecline}
            disabled={busy !== null}
            className="flex-1"
          >
            {busy === "decline" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Declining...
              </>
            ) : (
              "Decline"
            )}
          </Button>
        </div>
      )}
      {state.kind === "anon_parent_target" && (
        <AuthLinks token={props.token} signupRole="parent" />
      )}
      {state.kind === "anon_nanny_target" && (
        <AuthLinks token={props.token} signupRole="nanny" />
      )}
      {(state.kind === "not_found" ||
        state.kind === "revoked" ||
        state.kind === "already_connected") && (
        <Button asChild className="w-full">
          <Link href="/signup/parent">Sign up to add a child</Link>
        </Button>
      )}
      {state.kind === "wrong_role" && (
        <Button asChild variant="outline" className="w-full">
          <Link href={`/login?redirect=/invite/${props.token}`}>
            Sign in with a different account
          </Link>
        </Button>
      )}
    </div>
  );
}

// ── State-specific copy ─────────────────────────────────────────────

function Surface({ state }: { state: InviteState }) {
  switch (state.kind) {
    case "anon_parent_target":
      return (
        <Hero
          title={`${state.preview.inviterDisplay} invited you to follow ${state.preview.childFirstName} on Baby Bloom`}
          body={`Baby Bloom is where your nanny shares photos, milestones, and daily updates from your child's day.`}
        />
      );
    case "anon_nanny_target":
      return (
        <Hero
          title={`${state.preview.inviterDisplay} invited you to connect with ${state.preview.childFirstName} on Baby Bloom`}
          body={`Baby Bloom is where you can plan activities, log progress, and share updates with the family.`}
        />
      );
    case "ready_to_connect":
      return (
        <Hero
          title={`Connect ${state.preview.childFirstName} to your account?`}
          body={`You were invited by ${state.preview.inviterDisplay}.`}
        />
      );
    case "wrong_role":
      return (
        <Hero
          title={`This invite is for a ${state.expectedRole}`}
          body={`You're signed in as a ${state.currentRole ?? "different role"}. Sign out to claim this invite, or have someone else open it on their device.`}
        />
      );
    case "already_connected":
      return (
        <Hero
          title="This invite has expired"
          body={`${state.preview.childFirstName} has already been connected to a Baby Bloom account.`}
        />
      );
    case "revoked":
      return (
        <Hero
          title="This invite is no longer active"
          body="Ask the person who shared it for a fresh invite link."
        />
      );
    case "not_found":
      return (
        <Hero
          title="Invite not found"
          body="This link may have been mistyped or removed. Double-check it with the person who sent it."
        />
      );
    default: {
      // Exhaustiveness guard — adding a new InviteState variant in
      // state.ts without a render branch fails typecheck here.
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function Hero({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-3 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="text-sm text-slate-600">{body}</p>
    </div>
  );
}

function AuthLinks({
  token,
  signupRole,
}: {
  token: string;
  signupRole: "parent" | "nanny";
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild variant="outline" className="flex-1">
        <Link href={`/login?invite=${token}`}>Sign in</Link>
      </Button>
      <Button asChild className="flex-1">
        <Link href={`/signup/${signupRole}?invite=${token}`}>
          Create account
        </Link>
      </Button>
    </div>
  );
}
