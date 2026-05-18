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
import { createChildAsParent } from "@/lib/actions/bapp/child-clients";
import { ConsentCheckbox } from "@/components/legal/ConsentCheckbox";
import { PolicyContent } from "@/components/legal/PolicyContent";
import {
  earliestAllowedDobIso,
  todayIso,
  validateChildDob,
} from "@/lib/bapp/child-age";

interface AddChildSheetParentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChildSheetParent({
  open,
  onOpenChange,
}: AddChildSheetParentProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // T-015 — auto-ticked bundled consent. Untick disables submit.
  const [consented, setConsented] = useState(true);

  function reset() {
    setFirstName("");
    setDob("");
    setGender("");
    setError(null);
    setConsented(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !dob || !consented) return;
    const localCheck = validateChildDob(dob);
    if (!localCheck.ok) {
      setError(
        localCheck.error === "child_too_old"
          ? "Baby Bloom supports children under 3. Please add an older child via the nanny request form instead."
          : localCheck.error === "date_of_birth_in_future"
            ? "Date of birth can't be in the future."
            : "Please enter a valid date of birth.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    const result = await createChildAsParent({
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
      parent_app_consent_given: consented,
    });
    setLoading(false);
    if (!result.success || !result.data) {
      setError(result.error ?? "Failed to add child");
      return;
    }
    const childId = result.data.id;
    reset();
    onOpenChange(false);
    router.push(`/parent/development/${childId}`);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        onOpenChange(val);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Add your child</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="parent-add-first-name">First name</Label>
            <Input
              id="parent-add-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Child's first name"
              required
            />
          </div>
          <div>
            <Label htmlFor="parent-add-dob">Date of birth</Label>
            <Input
              id="parent-add-dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              min={earliestAllowedDobIso()}
              max={todayIso()}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Baby Bloom supports children under 3.
            </p>
          </div>
          <div>
            <Label htmlFor="parent-add-gender">Gender</Label>
            <select
              id="parent-add-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Prefer not to say</option>
              <option value="Boy">Boy</option>
              <option value="Girl">Girl</option>
            </select>
          </div>
          {/* T-015 — bundled parent-app-consent. Body text comes from
              legal_documents.body_md (slug=parent-app-consent), filled
              by T-014. Auto-ticked; untick disables submit. */}
          <div className="space-y-2">
            <PolicyContent slug="parent-app-consent" />
            <ConsentCheckbox
              label="I consent to Baby Bloom collecting and processing data for this child."
              description="Includes photos, daily observations, diary entries, and any sensitive information you choose to enter. You can withdraw this at any time. Renews annually. See policy above."
              defaultConsented={true}
              onConsentChange={setConsented}
              fieldName="parent_app_consent"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading || !firstName.trim() || !dob || !consented}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add child"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
