"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Utensils,
  Moon,
  BookOpen,
  Check,
  Loader2,
} from "lucide-react";
import { logDiaryEntry } from "@/lib/actions/bapp/diary";
import { ImageUpload } from "../shared/ImageUpload";

// "update" is the free-form parent-update entry (added 2026-05-07).
// Sits at the top of the type-selection step, mirrors the General
// Observation pattern in scope (note + optional image), produces
// a tile labelled "Diary Entry".
type DiaryType = "update" | "food" | "sleep";
type FoodSubtype = "meal" | "snack" | "bottle";

// Bottle quantity options: 30ml/1oz → 240ml/8oz in 30ml increments
const BOTTLE_QUANTITIES = [
  "30ml / 1oz",
  "60ml / 2oz",
  "90ml / 3oz",
  "120ml / 4oz",
  "150ml / 5oz",
  "180ml / 6oz",
  "210ml / 7oz",
  "240ml / 8oz",
];

interface DiarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
  /** Child's first name — used to personalise the Update note
   *  placeholder ("What have you been up to with Oliver?"). Falls
   *  back to "the kids" when null/empty. */
  childFirstName?: string | null;
}

function calcDuration(start: string, end: string): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;

  // Handle overnight (end < start → next day)
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  const diffMin = endMin - startMin;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function DiarySheet({
  open,
  onOpenChange,
  childId,
  childFirstName,
}: DiarySheetProps) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [diaryType, setDiaryType] = useState<DiaryType | null>(null);

  // Food state
  const [foodSubtype, setFoodSubtype] = useState<FoodSubtype>("meal");
  const [foodDetails, setFoodDetails] = useState("");
  const [bottleQuantity, setBottleQuantity] = useState("");
  const [foodTime, setFoodTime] = useState("");

  // Sleep state
  const [sleepStart, setSleepStart] = useState("");
  const [sleepEnd, setSleepEnd] = useState("");
  const [sleepNotes, setSleepNotes] = useState("");

  // Update state — free-form parent-update note (added 2026-05-07).
  const [updateNote, setUpdateNote] = useState("");

  // Image state — shared by all subtypes.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // F-001 sub-task 3: while a photo is mid-upload, every Save button
  // is disabled so the form can't post with image_url: null while the
  // URL is still in flight. ImageUpload fires the boolean via
  // `onUploadingChange`.
  const [imageUploading, setImageUploading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculate duration
  const duration = useMemo(
    () => calcDuration(sleepStart, sleepEnd),
    [sleepStart, sleepEnd],
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("type");
        setDiaryType(null);
        setFoodSubtype("meal");
        setFoodDetails("");
        setBottleQuantity("");
        setFoodTime("");
        setSleepStart("");
        setSleepEnd("");
        setSleepNotes("");
        setUpdateNote("");
        setImageUrl(null);
        setImageUploading(false);
        setLoading(false);
        setSuccess(false);
        setError(null);
      }, 300);
    }
  }, [open]);

  function selectType(type: DiaryType) {
    setDiaryType(type);
    setStep("form");
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function submitFood() {
    setLoading(true);
    setError(null);

    const data: Record<string, unknown> = {
      subtype: foodSubtype,
      details: foodSubtype === "bottle" ? null : foodDetails || null,
      quantity: foodSubtype === "bottle" ? bottleQuantity || null : null,
      time: foodTime || null,
      title: "Food Log",
      image_url: imageUrl,
    };

    try {
      const result = await logDiaryEntry(childId, data);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onOpenChange(false), 800);
      } else {
        setError(result.error ?? "Couldn't save your food log.");
        setLoading(false);
      }
    } catch (err) {
      // Server-action transport failure (network drop / edge crash).
      // Without this catch, `loading` stays true forever and the
      // sheet sticks on the spinner. Per silent-failure-hunter HIGH
      // on F-001 sub-task 3.
      console.error("[DiarySheet submitFood] transport error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function submitUpdate() {
    setLoading(true);
    setError(null);

    const data: Record<string, unknown> = {
      subtype: "update",
      note: updateNote.trim(),
      title: "Diary Entry",
      image_url: imageUrl,
    };

    try {
      const result = await logDiaryEntry(childId, data);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onOpenChange(false), 800);
      } else {
        // `result.error` may legally be null per the action's
        // return type; fall through to a generic message so the
        // sheet never shows a blank failure state.
        setError(result.error ?? "Couldn't save your update.");
        setLoading(false);
      }
    } catch (err) {
      // Server-action transport failures (network drop, edge
      // crash, serialisation error) throw out of `await`. Without
      // this catch, `loading` stays true forever and the sheet
      // becomes permanently stuck on the spinner.
      console.error("[DiarySheet submitUpdate] transport error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function submitSleep() {
    setLoading(true);
    setError(null);

    const data: Record<string, unknown> = {
      subtype: "sleep",
      start: sleepStart || null,
      end: sleepEnd || null,
      duration: duration || null,
      notes: sleepNotes || null,
      title: "Sleep Log",
      image_url: imageUrl,
    };

    try {
      const result = await logDiaryEntry(childId, data);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => onOpenChange(false), 800);
      } else {
        setError(result.error ?? "Couldn't save your sleep log.");
        setLoading(false);
      }
    } catch (err) {
      console.error("[DiarySheet submitSleep] transport error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const foodValid = foodSubtype === "bottle" ? !!bottleQuantity : !!foodDetails;

  const sleepValid = !!sleepStart && !!sleepEnd;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl px-4 pb-6">
        <SheetHeader className="pb-2">
          <div className="flex items-center gap-2">
            {step !== "type" && (
              <button
                type="button"
                onClick={() => {
                  setStep("type");
                  setDiaryType(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <SheetTitle className="text-base">
              {step === "type" && "New Diary Entry"}
              {step === "form" && diaryType === "update" && "Update"}
              {step === "form" && diaryType === "food" && "Food Log"}
              {step === "form" && diaryType === "sleep" && "Sleep Log"}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Success overlay */}
        {success && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-600">Added!</p>
          </div>
        )}

        {error && !success && (
          <p className="mb-3 text-center text-sm text-red-500">{error}</p>
        )}

        {!success && (
          <div className="mt-2 space-y-4">
            {/* Step 1: Type Selection */}
            {step === "type" && (
              <div className="space-y-2">
                {/* Update — top of the list per user spec
                    (2026-05-07). Free-form parent-update entry,
                    mirrors the General Observation pattern in
                    scope. Produces a tile labelled "Diary Entry". */}
                <button
                  type="button"
                  onClick={() => selectType("update")}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Update</p>
                    <p className="text-xs text-slate-400">
                      Update parents on what you have been up to
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => selectType("food")}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                    <Utensils className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Food</p>
                    <p className="text-xs text-slate-400">
                      Meals, snacks & bottles
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => selectType("sleep")}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <Moon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Sleep</p>
                    <p className="text-xs text-slate-400">
                      Naps & overnight sleep
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* Step 2a: Update — free-form parent-update note.
                Validation: note must be non-empty after trim
                (image alone isn't enough, since the tile body is
                the note). */}
            {step === "form" && diaryType === "update" && (
              <div className="space-y-4">
                <ImageUpload
                  childId={childId}
                  onUploaded={setImageUrl}
                  onUploadingChange={setImageUploading}
                />
                <div>
                  <Label className="text-xs text-slate-500">Note</Label>
                  <textarea
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    placeholder={`What have you been up to with ${
                      childFirstName?.trim() || "the kids"
                    }?`}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    rows={5}
                  />
                </div>
                <Button
                  onClick={submitUpdate}
                  disabled={loading || imageUploading || !updateNote.trim()}
                  className="w-full bg-violet-500 hover:bg-violet-600"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save Update"
                  )}
                </Button>
              </div>
            )}

            {/* Step 2b: Food Log */}
            {step === "form" && diaryType === "food" && (
              <div className="space-y-4">
                {/* Food type selector */}
                <div>
                  <Label className="text-xs text-slate-500">Type</Label>
                  <select
                    value={foodSubtype}
                    onChange={(e) =>
                      setFoodSubtype(e.target.value as FoodSubtype)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value="meal">Meal</option>
                    <option value="snack">Snack</option>
                    <option value="bottle">Bottle</option>
                  </select>
                </div>

                {/* Conditional: Meal/Snack → textarea, Bottle → quantity */}
                {foodSubtype === "bottle" ? (
                  <div>
                    <Label className="text-xs text-slate-500">Quantity</Label>
                    <select
                      value={bottleQuantity}
                      onChange={(e) => setBottleQuantity(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      <option value="">Select amount...</option>
                      {BOTTLE_QUANTITIES.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs text-slate-500">
                      What did they have?
                    </Label>
                    <textarea
                      value={foodDetails}
                      onChange={(e) => setFoodDetails(e.target.value)}
                      placeholder="Describe the meal or snack..."
                      className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      rows={3}
                    />
                  </div>
                )}

                {/* Time */}
                <div>
                  <Label className="text-xs text-slate-500">Time</Label>
                  <input
                    type="time"
                    value={foodTime}
                    onChange={(e) => setFoodTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </div>

                <ImageUpload
                  childId={childId}
                  onUploaded={setImageUrl}
                  onUploadingChange={setImageUploading}
                />

                <Button
                  onClick={submitFood}
                  disabled={loading || imageUploading || !foodValid}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Log Food"
                  )}
                </Button>
              </div>
            )}

            {/* Step 2b: Sleep Log */}
            {step === "form" && diaryType === "sleep" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-slate-500">
                    Went to Sleep
                  </Label>
                  <input
                    type="time"
                    value={sleepStart}
                    onChange={(e) => setSleepStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <Label className="text-xs text-slate-500">Woke Up</Label>
                  <input
                    type="time"
                    value={sleepEnd}
                    onChange={(e) => setSleepEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                {/* Auto-calculated duration */}
                {duration && (
                  <div className="rounded-lg bg-indigo-50 px-4 py-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-indigo-400">
                      Duration
                    </p>
                    <p className="text-lg font-semibold text-indigo-700">
                      {duration}
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-slate-500">
                    Notes (optional)
                  </Label>
                  <textarea
                    value={sleepNotes}
                    onChange={(e) => setSleepNotes(e.target.value)}
                    placeholder="Any notes about their sleep..."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    rows={2}
                  />
                </div>

                <ImageUpload
                  childId={childId}
                  onUploaded={setImageUrl}
                  onUploadingChange={setImageUploading}
                />

                <Button
                  onClick={submitSleep}
                  disabled={loading || imageUploading || !sleepValid}
                  className="w-full bg-indigo-500 hover:bg-indigo-600"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Log Sleep"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
