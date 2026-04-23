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
import { Loader2 } from "lucide-react";
import { onboardChild } from "@/lib/actions/bapp/child-clients";
import type { ChildClient } from "@/types/bapp";

interface OnboardSheetProps {
  child: ChildClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardSheet({ child, open, onOpenChange }: OnboardSheetProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>(child.gender ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setFirstName("");
    setDob("");
    setGender(child.gender ?? "");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !dob) return;

    setLoading(true);
    setError(null);

    const result = await onboardChild(child.id, {
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    resetForm();
    onOpenChange(false);
    router.push(`/nanny/development/${child.id}`);
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
          <SheetTitle>Set Up Child</SheetTitle>
        </SheetHeader>

        {child.age_months_approx && (
          <p className="mt-2 text-sm text-slate-500">
            Approximate age: ~{child.age_months_approx} months
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="onboard-first-name">First name</Label>
            <Input
              id="onboard-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Child's first name"
              required
            />
          </div>

          <div>
            <Label htmlFor="onboard-dob">Date of birth</Label>
            <Input
              id="onboard-dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="onboard-gender">Gender</Label>
            <select
              id="onboard-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Prefer not to say</option>
              <option value="Boy">Boy</option>
              <option value="Girl">Girl</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !firstName.trim() || !dob}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
