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
import { createChild } from "@/lib/actions/bapp/child-clients";

interface AddChildSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddChildSheet({ open, onOpenChange }: AddChildSheetProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [parentEmail, setParentEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setFirstName("");
    setDob("");
    setGender("");
    setParentEmail("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !dob || !parentEmail.trim()) return;

    setLoading(true);
    setError(null);

    const result = await createChild({
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
      parent_lead_email: parentEmail.trim().toLowerCase(),
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    resetForm();
    onOpenChange(false);
    if (result.data?.id) {
      router.push(`/nanny/development/${result.data.id}`);
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
          <SheetTitle>Add a Child</SheetTitle>
        </SheetHeader>

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

          <div>
            <Label htmlFor="add-parent-email">Parent&apos;s email</Label>
            <Input
              id="add-parent-email"
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="parent@example.com"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !firstName.trim() || !dob || !parentEmail.trim()}
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
      </SheetContent>
    </Sheet>
  );
}
