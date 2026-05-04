"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, Loader2 } from "lucide-react";
import { createChild } from "@/lib/actions/bapp/child-clients";

interface AddChildSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DISCLAIMER_TEXT =
  "I confirm I have the child's legal guardian's permission to add this child to Baby Bloom.";

export function AddChildSheet({ open, onOpenChange }: AddChildSheetProps) {
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
    if (!firstName.trim() || !dob || !permissionConfirmed) return;

    setLoading(true);
    setError(null);

    const result = await createChild({
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
      guardian_permission_confirmed: permissionConfirmed,
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
    if (childId) {
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
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>
            {inviteResult ? "Share with the parent" : "Add a Child"}
          </SheetTitle>
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
                required
              />
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={
                loading || !firstName.trim() || !dob || !permissionConfirmed
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
