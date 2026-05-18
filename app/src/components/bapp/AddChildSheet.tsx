"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, Loader2 } from "lucide-react";
import { createChild } from "@/lib/actions/bapp/child-clients";
import {
  earliestAllowedDobIso,
  todayIso,
  validateChildDob,
} from "@/lib/bapp/child-age";

interface AddChildSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * T-022 — onboarding contributions flow opt-ins. All four default to
   * the current children-tab behaviour so existing callers don't have
   * to change. The contributions page sets all four to opt the drawer
   * into onboarding mode (terms text instead of checkbox, custom title
   * + success route, bonus-program attribution forwarded to createChild).
   */
  /** When true: replace the violet guardian-permission checkbox with a
   * single-line terms statement linking to /legal/professional-terms.
   * Auto-sets `guardian_permission_confirmed: true` on submit. */
  hideGuardianCheckbox?: boolean;
  /** When set: overrides the form-view SheetTitle. The invite-view title
   * ("Share with the parent") is unaffected — it serves both flows. */
  title?: string;
  /** When set: Done routes here instead of the default
   * `/nanny/development/{childId}`. Used by the contributions page to
   * continue into verification at Step 1. */
  successHref?: string;
  /** When true: forwarded to createChild → mintChildInvite as
   * `bonusProgram`. Persists `child_invites.bonus_program=true` and
   * stamps `nannies.bonus_program_completed_at`. */
  fromBonusProgram?: boolean;
}

const DISCLAIMER_TEXT =
  "I confirm I have the child's legal guardian's permission to add this child to Baby Bloom.";

export function AddChildSheet({
  open,
  onOpenChange,
  hideGuardianCheckbox = false,
  title,
  successHref,
  fromBonusProgram = false,
}: AddChildSheetProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    childId: string;
    url: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function resetForm() {
    setFirstName("");
    setDob("");
    setGender("");
    setPermissionConfirmed(false);
    setError(null);
    setInviteResult(null);
    setCopied(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // When the checkbox is hidden (onboarding flow) the guardian-permission
    // attestation is satisfied by the terms line above the submit button —
    // the submit click itself is the affirmation, mirroring the mockup.
    if (
      !firstName.trim() ||
      !dob ||
      (!hideGuardianCheckbox && !permissionConfirmed)
    )
      return;

    const localCheck = validateChildDob(dob);
    if (!localCheck.ok) {
      setError(
        localCheck.error === "child_too_old"
          ? "Baby Bloom supports children under 3."
          : localCheck.error === "date_of_birth_in_future"
            ? "Date of birth can't be in the future."
            : "Please enter a valid date of birth.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    const result = await createChild({
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
      // When the checkbox is hidden, the terms line above the submit
      // button is the disclosure surface; treat submission as affirmation.
      guardian_permission_confirmed: hideGuardianCheckbox
        ? true
        : permissionConfirmed,
      fromBonusProgram,
    });

    setLoading(false);

    if (!result.success || !result.data) {
      setError(result.error ?? "Failed to add child");
      return;
    }

    setInviteResult({ childId: result.data.id, url: result.data.inviteUrl });
  }

  async function handleCopy() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in some browser contexts; fall back to
      // letting the user select the text manually.
    }
  }

  function handleDone() {
    const childId = inviteResult?.childId;
    resetForm();
    onOpenChange(false);
    if (successHref) {
      router.push(successHref);
    } else if (childId) {
      router.push(`/nanny/development/${childId}`);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl"
        onOpenAutoFocus={(event) => {
          // Default Radix behaviour focuses the close button. For a form
          // drawer the natural target is the first input — push focus there
          // unless we're in the post-submit invite view.
          if (!inviteResult) {
            event.preventDefault();
            document.getElementById("add-first-name")?.focus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {inviteResult ? "Share with the parent" : (title ?? "Add a Child")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {inviteResult
              ? "Copy the invite link to share with the child's parent."
              : "Enter the child's first name, date of birth, and gender to create their profile."}
          </SheetDescription>
        </SheetHeader>

        {inviteResult ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Send this private invite link to the child&apos;s parent.
              They&apos;ll be able to claim it from any device.
            </p>
            <div className="flex items-stretch gap-2">
              <Input
                readOnly
                value={inviteResult.url}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <Button
              type="button"
              onClick={handleDone}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="add-first-name">First name</Label>
              <Input
                id="add-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Child's first name"
                required
              />
            </div>

            <div>
              <Label htmlFor="add-dob">Date of birth</Label>
              <Input
                id="add-dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                min={earliestAllowedDobIso()}
                max={todayIso()}
                required
                aria-describedby={
                  error
                    ? "add-dob-helper add-child-form-error"
                    : "add-dob-helper"
                }
                aria-invalid={error ? true : undefined}
              />
              <p id="add-dob-helper" className="mt-1 text-xs text-slate-500">
                Baby Bloom supports children under 3.
              </p>
            </div>

            <div>
              <Label htmlFor="add-gender">Gender</Label>
              <select
                id="add-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Prefer not to say</option>
                <option value="Boy">Boy</option>
                <option value="Girl">Girl</option>
              </select>
            </div>

            {hideGuardianCheckbox ? (
              <p
                id="add-child-terms-agreement"
                className="text-center text-xs leading-relaxed text-slate-600"
              >
                By continuing, you agree to our{" "}
                <a
                  href="/legal/professional-terms"
                  className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-800"
                >
                  Terms &amp; Conditions
                </a>{" "}
                and confirm you have the child&apos;s legal guardian&apos;s
                permission to add them to Baby Bloom.
              </p>
            ) : (
              <label className="flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-3 text-sm text-violet-900">
                <input
                  type="checkbox"
                  checked={permissionConfirmed}
                  onChange={(e) => setPermissionConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                  required
                />
                <span>{DISCLAIMER_TEXT}</span>
              </label>
            )}

            {error && (
              <p
                id="add-child-form-error"
                role="alert"
                className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={
                loading ||
                !firstName.trim() ||
                !dob ||
                (!hideGuardianCheckbox && !permissionConfirmed)
              }
              aria-describedby={
                hideGuardianCheckbox ? "add-child-terms-agreement" : undefined
              }
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Add Child"
              )}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
