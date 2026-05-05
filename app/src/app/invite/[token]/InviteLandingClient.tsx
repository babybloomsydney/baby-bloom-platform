"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  /**
   * Set when the signed-in parent already has an active placement with
   * a DIFFERENT nanny than the inviter — see
   * `CORRECTION-UNIQUE-PLACEMENT-CONSTRAINT.md`. When `isSwitching`
   * is true, the Connect button stays disabled until the parent ticks
   * the switch-confirmation checkbox.
   */
  switchContext?: { isSwitching: boolean; fromNannyName: string | null };
}

export function InviteLandingClient(props: InviteLandingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?auto=1` set by the post-signup / post-login redirect — the user
  // already consented by signing up via the invite, so we skip the
  // second "Connect" tap. Switch-ack still gates the auto-fire so the
  // single-nanny-per-parent invariant warning is never bypassed.
  const autoMode = searchParams.get("auto") === "1";
  // The connect server action can return role_mismatch /
  // invite_already_connected after the page loaded — we override the
  // derived state when that happens so the user sees the right surface
  // without a full reload.
  const [override, setOverride] = useState<InviteState | null>(null);
  const [busy, setBusy] = useState<"connect" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switchAcked, setSwitchAcked] = useState(false);
  const requiresSwitchAck = props.switchContext?.isSwitching === true;
  const autoFiredRef = useRef(false);

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

  // Auto-fire `connect` once on mount when the user arrived via
  // `?auto=1` and the state is otherwise actionable. Guarded by the
  // ref so React strict-mode / re-renders don't double-call. We don't
  // include `handleConnect` in deps — it's stable per render and the
  // ref makes idempotency explicit.
  useEffect(() => {
    if (!autoMode) return;
    if (autoFiredRef.current) return;
    if (state.kind !== "ready_to_connect") return;
    if (requiresSwitchAck) return;
    if (busy !== null) return;
    autoFiredRef.current = true;
    void handleConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, state.kind, requiresSwitchAck, busy]);

  // While the auto-flow is connecting, swap the page chrome for a
  // small "Connecting…" surface so the user sees forward motion
  // instead of the redundant "Connect / Decline" prompt flashing.
  if (autoMode && state.kind === "ready_to_connect" && !requiresSwitchAck) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        <p className="text-sm text-slate-600">
          Connecting you to {state.preview.childFirstName}…
        </p>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    );
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
        <div className="space-y-4">
          {requiresSwitchAck && (
            <SwitchWarning
              fromNannyName={props.switchContext?.fromNannyName ?? null}
              toNannyName={state.preview.inviterDisplay}
              acknowledged={switchAcked}
              onAcknowledgeChange={setSwitchAcked}
            />
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              onClick={handleConnect}
              disabled={busy !== null || (requiresSwitchAck && !switchAcked)}
              className="flex-1"
            >
              {busy === "connect" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : requiresSwitchAck ? (
                `Switch to ${state.preview.inviterDisplay}`
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

function SwitchWarning({
  fromNannyName,
  toNannyName,
  acknowledged,
  onAcknowledgeChange,
}: {
  fromNannyName: string | null;
  toNannyName: string;
  acknowledged: boolean;
  onAcknowledgeChange: (next: boolean) => void;
}) {
  // Single-nanny-per-parent invariant — see
  // CORRECTION-UNIQUE-PLACEMENT-CONSTRAINT.md. When the parent has an
  // existing active placement with a different nanny, we surface this
  // warning + checkbox so the auto-end-on-switch behaviour in
  // `ensure_placement` is never a surprise.
  const fromLabel = fromNannyName ?? "your current nanny";
  return (
    <div
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3"
      role="region"
      aria-label="You are switching nannies"
    >
      <p className="text-sm font-semibold text-amber-900">
        You&apos;re switching nannies
      </p>
      <p className="mt-1 text-xs text-amber-800">
        You&apos;re currently linked with <strong>{fromLabel}</strong> on Baby
        Bloom. Connecting with <strong>{toNannyName}</strong> will end your
        existing relationship — including any subscription, feed access, and
        ongoing engagement. {toNannyName} will become your new nanny.
      </p>
      <label className="mt-3 flex items-start gap-2 text-xs text-amber-900">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledgeChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
        />
        <span>I understand I&apos;m switching nannies</span>
      </label>
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
