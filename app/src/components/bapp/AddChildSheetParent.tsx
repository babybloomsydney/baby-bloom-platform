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

  function reset() {
    setFirstName("");
    setDob("");
    setGender("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !dob) return;
    setLoading(true);
    setError(null);
    const result = await createChildAsParent({
      first_name: firstName.trim(),
      date_of_birth: dob,
      gender: gender || null,
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
              required
            />
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
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
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
