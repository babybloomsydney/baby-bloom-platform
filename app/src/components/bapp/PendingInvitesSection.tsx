"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { declineChildInviteById } from "@/lib/actions/bapp/child-invites";
import type { PendingInviteCard } from "@/types/bapp";

interface PendingInvitesSectionProps {
  initialInvites: PendingInviteCard[];
}

export function PendingInvitesSection({
  initialInvites,
}: PendingInvitesSectionProps) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (invites.length === 0) return null;

  function handleConnect(inviteId: string) {
    // Server-only resolver — never expose the token to the client.
    router.push(`/invite/connect/${inviteId}`);
  }

  async function handleDecline(card: PendingInviteCard) {
    setBusyInviteId(card.inviteId);
    setErrorMessage(null);
    const result = await declineChildInviteById(card.inviteId);
    if (!result.success) {
      setErrorMessage(
        result.error === "not_recipient"
          ? "This invite is for someone else."
          : "Couldn't decline. Please try again.",
      );
      setBusyInviteId(null);
      return;
    }
    // Order matters in concurrent React: filter first, refresh next,
    // clear busy LAST. If we cleared busy before refresh, the briefly-
    // re-rendered RSC payload could put the card back before the
    // optimistic filter applied.
    setInvites((prev) => prev.filter((inv) => inv.inviteId !== card.inviteId));
    router.refresh();
    setBusyInviteId(null);
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">
        Pending invites
      </h2>
      <div className="space-y-2">
        {invites.map((invite) => {
          const isBusy = busyInviteId === invite.inviteId;
          return (
            <div
              key={invite.inviteId}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
            >
              <p className="text-sm font-medium text-slate-900">
                {invite.inviterFirstName} invited you to connect{" "}
                {invite.childFirstName}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleConnect(invite.inviteId)}
                  disabled={isBusy}
                >
                  Connect
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDecline(invite)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Declining...
                    </>
                  ) : (
                    "Decline"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
