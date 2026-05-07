"use client";

/**
 * 3-dot overflow menu rendered in the top-right of every tile.
 *
 * v1 surfaces a single action — Delete — gated behind a confirm
 * dialog. The user explicitly accepted delete-only as an acceptable
 * floor while edit is deferred (2026-05-07).
 *
 * Soft-delete only: the row stays in `bapp_logs` (`is_active=false`)
 * so Katie's memory + audit history don't lose data. The feed
 * already filters `is_active=true`, so the row drops out of the
 * user's view immediately.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { softDeleteBAppLog } from "@/lib/actions/bapp/logs";

interface TileActionMenuProps {
  /** `bapp_logs.id` of the tile being acted on. */
  logId: string;
}

export function TileActionMenu({ logId }: TileActionMenuProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onDeleteClicked() {
    setError(null);
    setConfirmOpen(true);
  }

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteBAppLog(logId);
      if (!result.success) {
        setError(result.error ?? "Couldn't delete this tile.");
        return;
      }
      setConfirmOpen(false);
      // Server action already calls revalidatePath; router.refresh()
      // makes the current Server Component re-fetch its initial feed
      // so the deleted tile vanishes immediately without waiting for
      // the smart-poll interval.
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Tile actions"
            // Disabled while a delete is in flight so a double-tap
            // can't queue a second confirm-dialog open while the
            // first transition is still settling.
            disabled={isPending}
            // 24×24 hit-area meets WCAG 2.5.8. Background only on
            // hover/focus so the resting state stays calm against
            // the tile surface.
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50 disabled:pointer-events-none"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={onDeleteClicked}
            disabled={isPending}
            className="cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-700"
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this tile?</DialogTitle>
            <DialogDescription>
              It will be removed from the feed. This can&apos;t be undone from
              the app.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
