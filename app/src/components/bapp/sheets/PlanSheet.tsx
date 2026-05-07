"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_MILESTONES_PER_ACTIVITY } from "@/lib/bapp-constants";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { getProgressMatrix } from "@/lib/actions/bapp/progress";
import { generateActivity } from "@/lib/actions/bapp/activities";
import { MilestoneBrowser } from "../shared/MilestoneBrowser";
import { DomainBadge } from "../shared/DomainBadge";
import type { Milestone } from "@/types/bapp";

interface PlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
}

export function PlanSheet({ open, onOpenChange, childId }: PlanSheetProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [progressMatrix, setProgressMatrix] = useState<Record<string, number>>(
    {},
  );
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = selected.size >= MAX_MILESTONES_PER_ACTIVITY;

  // Load data when sheet opens
  const loadData = useCallback(async () => {
    const [msRes, matrixRes] = await Promise.all([
      getMilestones(),
      getProgressMatrix(childId),
    ]);
    if (msRes.success) setMilestones(msRes.data);
    if (matrixRes.success) setProgressMatrix(matrixRes.data);
  }, [childId]);

  useEffect(() => {
    if (open) {
      loadData();
    } else {
      setTimeout(() => {
        setSelected(new Map());
        setLoading(false);
        setError(null);
      }, 300);
    }
  }, [open, loadData]);

  function handleSelect(milestoneId: string) {
    if (selected.has(milestoneId)) return;
    if (atLimit) return;
    const next = new Map(selected);
    next.set(milestoneId, 0); // score not used in select mode
    setSelected(next);
  }

  function handleRemove(milestoneId: string) {
    const next = new Map(selected);
    next.delete(milestoneId);
    setSelected(next);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const milestoneIds = Array.from(selected.keys());
    const result = await generateActivity(childId, milestoneIds);
    if (result.success) {
      onOpenChange(false);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  // Filter milestones to exclude already-selected ones
  const availableMilestones = milestones.filter((m) => !selected.has(m.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl px-4 pb-6">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base">Design Activity</SheetTitle>
        </SheetHeader>

        <div
          className="mt-2 overflow-y-auto"
          style={{ maxHeight: "calc(90vh - 140px)" }}
        >
          {/* Selected objectives tags */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from(selected.keys()).map((id) => {
                const m = milestones.find((ms) => ms.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                  >
                    {m && (
                      <DomainBadge
                        domain={m.domain}
                        className="text-[10px] px-1.5 py-0"
                      />
                    )}
                    <span className="max-w-[150px] truncate">
                      {m?.description ?? id}
                    </span>
                    <button type="button" onClick={() => handleRemove(id)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* At limit — show ready message */}
          {atLimit ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
                <Sparkles className="h-7 w-7 text-indigo-600" />
              </div>
              <p className="text-sm font-medium text-indigo-700">
                Ready to Generate!
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {MAX_MILESTONES_PER_ACTIVITY} milestones selected
              </p>
            </div>
          ) : (
            <MilestoneBrowser
              milestones={availableMilestones}
              progressMatrix={progressMatrix}
              selected={selected}
              onSelect={handleSelect}
              mode="select"
              maxSelections={MAX_MILESTONES_PER_ACTIVITY}
            />
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Fixed footer button */}
        {selected.size > 0 && (
          <div className="mt-3">
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-600"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Create Activity (${selected.size})`
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
