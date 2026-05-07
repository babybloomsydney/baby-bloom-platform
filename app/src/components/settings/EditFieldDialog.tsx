"use client";

/**
 * Focused single-field edit dialog. Reference: banking apps and
 * Apple ID — clicking "Email" doesn't open a sprawling form; it
 * opens a dialog dedicated to that one field. The narrow scope
 * and explicit Save / Cancel buttons make the act of changing
 * sensitive data feel deliberate, which is the trust signal a
 * settings page is supposed to broadcast.
 *
 * The wrapper is generic — callers pass the editor markup as
 * `children`, plus an `onSubmit` that runs in a transition. The
 * dialog handles loading state, error display, and dismissal.
 */

import { useState, useTransition, type ReactNode, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  /** Submit handler. Returning `{ success: false, error: ... }`
   *  surfaces the error inline; returning `{ success: true }`
   *  closes the dialog. */
  onSubmit: () => Promise<{ success: boolean; error?: string | null }>;
  /** Disable the save button when the form fields aren't valid. */
  canSubmit?: boolean;
  /** Custom save button label (defaults to "Save"). */
  saveLabel?: string;
  /** Children render the field editor(s). The wrapping <form>
   *  intercepts Enter to trigger save. */
  children: ReactNode;
}

export function EditFieldDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  canSubmit = true,
  saveLabel = "Save",
  children,
}: EditFieldDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await onSubmit();
      if (!result.success) {
        setError(result.error ?? "Couldn't save those changes.");
        return;
      }
      onOpenChange(false);
    });
  };

  function onChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handle} className="space-y-4">
          {error && (
            <div
              key={error}
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {children}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || isPending}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                saveLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
