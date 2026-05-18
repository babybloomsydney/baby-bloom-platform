"use client";

/**
 * Pencil-edit dialog for the child hero card. Edits `first_name`
 * and `date_of_birth` only — the avatar lives on its own click
 * surface (`ChildAvatarEditor`). Mirrors the auth-gate pattern of
 * the existing avatar editors:
 *
 *   - Either the linked nanny OR the linked parent may edit (the
 *     server action enforces this; this UI just exposes the affordance).
 *   - Empty / future-DOB submissions are rejected client-side AND
 *     server-side (defence in depth — same validation rule lives in
 *     `updateChildDetails`).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateChildDetails } from "@/lib/actions/bapp/child-clients";
import {
  earliestAllowedDobIso,
  todayIso,
  validateChildDob,
} from "@/lib/bapp/child-age";

interface ChildDetailsEditorProps {
  childId: string;
  currentFirstName: string | null;
  currentDateOfBirth: string | null;
}

const NAME_MAX = 80;

export function ChildDetailsEditor({
  childId,
  currentFirstName,
  currentDateOfBirth,
}: ChildDetailsEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(currentFirstName ?? "");
  const [dob, setDob] = useState(currentDateOfBirth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset form to current values whenever the dialog opens, so a
      // half-edited cancel doesn't bleed into the next session.
      setFirstName(currentFirstName ?? "");
      setDob(currentDateOfBirth ?? "");
      setError(null);
    }
  }

  function handleSubmit() {
    setError(null);
    const trimmedName = firstName.trim();

    if (trimmedName.length === 0) {
      setError("Name can't be empty.");
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      setError(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }

    // Build the patch as fields-changed so the server action only
    // touches what actually moved. Empty-string DOB clears the date.
    const patch: { first_name?: string; date_of_birth?: string | null } = {};
    if (trimmedName !== (currentFirstName ?? "")) {
      patch.first_name = trimmedName;
    }
    if (dob !== (currentDateOfBirth ?? "")) {
      // Non-empty DOB must satisfy the under-3 cap. Empty clears the date.
      if (dob !== "") {
        const dobCheck = validateChildDob(dob);
        if (!dobCheck.ok) {
          setError(
            dobCheck.error === "child_too_old"
              ? "Baby Bloom supports children under 3."
              : dobCheck.error === "date_of_birth_in_future"
                ? "Date of birth can't be in the future."
                : "Please enter a valid date of birth.",
          );
          return;
        }
      }
      patch.date_of_birth = dob === "" ? null : dob;
    }

    if (Object.keys(patch).length === 0) {
      // Nothing changed — close without firing the server action.
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await updateChildDetails(childId, patch);
      if (!result.success) {
        setError(result.error ?? "Couldn't save those changes.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  // DoB bounds for the date input: max = today (no future), min =
  // earliest allowed under the under-3 cap. Mirrors the server-side
  // `validateChildDob` rules so client picker + server guard agree.
  const dobMaxIso = todayIso();
  const dobMinIso = earliestAllowedDobIso();

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Edit child details"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
          </DialogHeader>

          {error && (
            <div
              key={error}
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="child-edit-name">First name</Label>
              <Input
                id="child-edit-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={NAME_MAX}
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="child-edit-dob">Date of birth</Label>
              <Input
                id="child-edit-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                min={dobMinIso}
                max={dobMaxIso}
                disabled={isPending}
              />
              <p className="text-xs text-slate-500">
                Baby Bloom supports children under 3.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
