"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  MoreVertical,
} from "lucide-react";
import { PositionDetailView } from "@/app/parent/request/renderers/PositionDetailView";
import { closePosition } from "@/lib/actions/parent";
import type { PositionWithChildren } from "@/lib/actions/parent";
import type { TypeformFormData } from "@/app/parent/request/questions";

interface MyChildcareTabProps {
  position: PositionWithChildren | null;
  /**
   * True when the parent has an active placement. Set by the page-
   * level fetch via `getParentPlacement`. When true, the
   * "recreate position" prompt is suppressed in favour of a
   * placement-aware summary — the parent went through the invite
   * link path, not the matchmaking form, so prompting them to
   * recreate the position is wrong.
   */
  hasActivePlacement?: boolean;
}

export function MyChildcareTab({
  position,
  hasActivePlacement = false,
}: MyChildcareTabProps) {
  const router = useRouter();
  const [positionEditing, setPositionEditing] = useState(false);
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);

  const details = position
    ? (position.details as Record<string, unknown> | null)
    : null;
  const formData = (details?.form_data ?? {}) as Partial<TypeformFormData>;
  const hasPosition = !!position;
  const hasFormData = !!details?.form_data;

  const handleClosePosition = async () => {
    if (!position) return;
    setClosing(true);
    const result = await closePosition(position.id);
    setClosing(false);
    if (result.success) {
      setShowCloseConfirm(false);
      router.refresh();
    }
  };

  return (
    <div className="px-5 pb-5 pt-3">
      {!hasPosition ? (
        <div className="text-center py-8 space-y-2">
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/parent/request">Create childcare position</Link>
          </Button>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Create your position to kickstart our childcare journey
          </p>
        </div>
      ) : !hasFormData && hasActivePlacement ? (
        // Invite-link path — the position was auto-created by
        // `ensure_placement` to anchor the placement, but the parent
        // never went through the typeform. Showing them "recreate
        // position" is wrong; they have a nanny, the marketplace
        // listing is intentionally empty.
        <div className="text-center py-8 space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <Check className="h-6 w-6 text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            You&apos;re linked with your nanny
          </p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You connected via an invite link, so there&apos;s no marketplace
            position to manage here.
          </p>
        </div>
      ) : !hasFormData ? (
        <div className="text-center py-8 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
            <ClipboardList className="h-6 w-6 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              Position needs updating
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Please recreate your childcare position using the new form to
              enable editing.
            </p>
          </div>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/parent/request">Recreate Position</Link>
          </Button>
        </div>
      ) : (
        <PositionDetailView
          initialData={formData}
          editingExternal={positionEditing}
          onEditingChange={setPositionEditing}
          hideClosePosition
          menuSlot={
            <div className="flex items-center gap-1 flex-shrink-0">
              {positionEditing && (
                <button
                  onClick={() => setPositionEditing(false)}
                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPositionMenu((p) => !p)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {showPositionMenu && (
                  <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-10">
                    <button
                      onClick={() => {
                        setShowPositionMenu(false);
                        setPositionEditing(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setShowPositionMenu(false);
                        setShowCloseConfirm(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-lg transition-colors"
                    >
                      Close this position
                    </button>
                  </div>
                )}
              </div>
            </div>
          }
        />
      )}

      {/* Close Position Confirmation */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Close Position?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Are you sure you want to close this childcare position? This
                will:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                <li>Remove your position from matching</li>
                <li>Cancel any pending interview requests</li>
                <li>Allow you to create a new position</li>
              </ul>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCloseConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleClosePosition}
                  disabled={closing}
                >
                  {closing ? "Closing..." : "Close Position"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
