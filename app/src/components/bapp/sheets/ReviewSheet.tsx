"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2 } from "lucide-react";
import { DomainBadge } from "../shared/DomainBadge";
import { MasteryRatingGrid } from "../shared/MasteryRatingGrid";
import { ImageUpload } from "../shared/ImageUpload";
import { submitReport } from "@/lib/actions/bapp/reports";
import type { Milestone } from "@/types/bapp";

interface ReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityId: string;
  childId: string;
  activityTitle: string;
  milestones: Milestone[];
  onComplete: () => void;
}

export function ReviewSheet({
  open,
  onOpenChange,
  activityId,
  childId,
  activityTitle,
  milestones,
  onComplete,
}: ReviewSheetProps) {
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [feedback, setFeedback] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setRatings(new Map());
        setFeedback("");
        setImageUrl(null);
        setLoading(false);
        setSuccess(false);
        setError(null);
      }, 300);
    }
  }, [open]);

  function setRating(milestoneId: string, score: number) {
    const next = new Map(ratings);
    next.set(milestoneId, score);
    setRatings(next);
  }

  const allRated = milestones.length > 0 && ratings.size === milestones.length;

  async function handleSubmit() {
    if (!allRated) return;

    setLoading(true);
    setError(null);

    const ratingsArray = Array.from(ratings.entries()).map(([id, score]) => ({
      id,
      score,
    }));

    const result = await submitReport(
      activityId,
      childId,
      ratingsArray,
      feedback || null,
      imageUrl,
    );

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        onComplete();
      }, 800);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl px-4 pb-6">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">{activityTitle}</SheetTitle>
        </SheetHeader>

        {/* Success overlay */}
        {success && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-600">
              Report Submitted!
            </p>
          </div>
        )}

        {error && !success && (
          <p className="mb-3 text-center text-sm text-red-500">{error}</p>
        )}

        {!success && (
          <div
            className="mt-2 overflow-y-auto"
            style={{ maxHeight: "calc(85dvh - 160px)" }}
          >
            <div className="space-y-5">
              {/* Milestone ratings */}
              {milestones.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <DomainBadge
                      domain={m.domain}
                      className="bg-white shadow-sm"
                    />
                    <p className="text-sm font-medium text-slate-700">
                      {m.description}
                    </p>
                  </div>
                  <MasteryRatingGrid
                    selectedScore={ratings.get(m.id) ?? null}
                    onSelect={(score) => setRating(m.id, score)}
                  />
                </div>
              ))}

              {/* Feedback */}
              <div>
                <Label className="text-xs text-slate-500">
                  Notes (optional)
                </Label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="How did the activity go?"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  rows={3}
                />
              </div>

              {/* Image upload */}
              <ImageUpload childId={childId} onUploaded={setImageUrl} />
            </div>
          </div>
        )}

        {/* Submit button */}
        {!success && (
          <div className="mt-3">
            <Button
              onClick={handleSubmit}
              disabled={loading || !allRated}
              className="w-full bg-emerald-500 hover:bg-emerald-600"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Report"
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
