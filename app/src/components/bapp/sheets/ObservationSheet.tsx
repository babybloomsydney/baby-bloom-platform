"use client";

import { useState, useEffect, useCallback } from "react";
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
  MessageSquare,
  Focus,
  TrendingUp,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DOMAINS, MASTERY_LABELS, type DomainCode } from "@/lib/bapp-constants";
import {
  logObservation,
  logBulkProgress,
} from "@/lib/actions/bapp/observations";
import { getMilestones } from "@/lib/actions/bapp/milestones";
import { getProgressMatrix } from "@/lib/actions/bapp/progress";
import { ImageUpload } from "../shared/ImageUpload";
import { MilestoneBrowser } from "../shared/MilestoneBrowser";
import { DomainBadge } from "../shared/DomainBadge";
import { MasteryLabel } from "../shared/MasteryLabel";
import type { Milestone } from "@/types/bapp";

type ObsType = "general" | "focused" | "progress";
type Step = "type" | "form" | "note";

interface ObservationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  childId: string;
}

export function ObservationSheet({
  open,
  onOpenChange,
  childId,
}: ObservationSheetProps) {
  const [step, setStep] = useState<Step>("type");
  const [obsType, setObsType] = useState<ObsType | null>(null);

  // General + Focused state
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [domainDropdown, setDomainDropdown] = useState("");

  // Progress state
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [progressMatrix, setProgressMatrix] = useState<Record<string, number>>(
    {},
  );
  const [selectedProgress, setSelectedProgress] = useState<Map<string, number>>(
    new Map(),
  );
  const [progressNote, setProgressNote] = useState("");
  const [progressImageUrl, setProgressImageUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("type");
        setObsType(null);
        setNote("");
        setImageUrl(null);
        setSelectedDomains([]);
        setDomainDropdown("");
        setSelectedProgress(new Map());
        setProgressNote("");
        setProgressImageUrl(null);
        setLoading(false);
        setSuccess(false);
        setError(null);
      }, 300);
    }
  }, [open]);

  // Load milestones + progress matrix when opening progress wizard
  const loadProgressData = useCallback(async () => {
    const [msRes, matrixRes] = await Promise.all([
      getMilestones(),
      getProgressMatrix(childId),
    ]);
    if (msRes.success) setMilestones(msRes.data);
    if (matrixRes.success) setProgressMatrix(matrixRes.data);
  }, [childId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function selectType(type: ObsType) {
    setObsType(type);
    setStep("form");
    if (type === "progress") {
      loadProgressData();
    }
  }

  function handleBack() {
    if (step === "note") {
      setStep("form");
    } else {
      setStep("type");
      setObsType(null);
    }
  }

  function addDomain() {
    if (domainDropdown && !selectedDomains.includes(domainDropdown)) {
      setSelectedDomains([...selectedDomains, domainDropdown]);
      setDomainDropdown("");
    }
  }

  function removeDomain(domain: string) {
    setSelectedDomains(selectedDomains.filter((d) => d !== domain));
  }

  // ---------------------------------------------------------------------------
  // Submit handlers
  // ---------------------------------------------------------------------------

  async function submitGeneral() {
    setLoading(true);
    setError(null);
    const result = await logObservation(childId, {
      domain: "General",
      milestone_id: null,
      score: null,
      note: note || null,
      image_url: imageUrl,
      title: "Note: General",
    });
    if (result.success) {
      setSuccess(true);
      setTimeout(() => onOpenChange(false), 800);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  async function submitFocused() {
    setLoading(true);
    setError(null);
    const domainStr = selectedDomains.join(", ");
    const result = await logObservation(childId, {
      domain: domainStr,
      milestone_id: null,
      score: null,
      note: note || null,
      image_url: imageUrl,
      title: `Note: ${domainStr}`,
    });
    if (result.success) {
      setSuccess(true);
      setTimeout(() => onOpenChange(false), 800);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  async function submitProgress() {
    setLoading(true);
    setError(null);
    const updates = Array.from(selectedProgress.entries()).map(
      ([id, score]) => ({
        id,
        score,
      }),
    );
    const result = await logBulkProgress(
      childId,
      updates,
      progressNote || null,
      progressImageUrl,
    );
    if (result.success) {
      setSuccess(true);
      setTimeout(() => onOpenChange(false), 800);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

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
                onClick={handleBack}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <SheetTitle className="text-base">
              {step === "type" && "New Observation"}
              {step === "form" &&
                obsType === "general" &&
                "General Observation"}
              {step === "form" &&
                obsType === "focused" &&
                "Focused Observation"}
              {step === "form" && obsType === "progress" && "Progress Update"}
              {step === "note" && "Add Note"}
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

        {/* Error */}
        {error && !success && (
          <p className="mb-3 text-center text-sm text-red-500">{error}</p>
        )}

        {!success && (
          <div
            className="mt-2 overflow-y-auto"
            style={{ maxHeight: "calc(85dvh - 120px)" }}
          >
            {/* Step 1: Type Selection */}
            {step === "type" && (
              <div className="space-y-2">
                <TypeCard
                  icon={MessageSquare}
                  color="bg-slate-100 text-slate-600"
                  title="General"
                  description="Quick note about anything"
                  onClick={() => selectType("general")}
                />
                <TypeCard
                  icon={Focus}
                  color="bg-indigo-100 text-indigo-600"
                  title="Focused"
                  description="Note with domain tags"
                  onClick={() => selectType("focused")}
                />
                <TypeCard
                  icon={TrendingUp}
                  color="bg-emerald-100 text-emerald-600"
                  title="Progress"
                  description="Rate milestone mastery"
                  onClick={() => selectType("progress")}
                />
              </div>
            )}

            {/* Step 2a: General Observation */}
            {step === "form" && obsType === "general" && (
              <div className="space-y-4">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  General
                </span>
                <ImageUpload childId={childId} onUploaded={setImageUrl} />
                <div>
                  <Label className="text-xs text-slate-500">Note</Label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What did you observe?"
                    className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    rows={4}
                  />
                </div>
                <Button
                  onClick={submitGeneral}
                  disabled={loading || (!note && !imageUrl)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save Observation"
                  )}
                </Button>
              </div>
            )}

            {/* Step 2b: Focused Observation */}
            {step === "form" && obsType === "focused" && (
              <div className="space-y-4">
                {/* Domain selector */}
                <div>
                  <Label className="text-xs text-slate-500">Domains</Label>
                  <div className="mt-1 flex gap-2">
                    <select
                      value={domainDropdown}
                      onChange={(e) => setDomainDropdown(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">Select domain...</option>
                      {Object.entries(DOMAINS).map(([code, info]) => (
                        <option
                          key={code}
                          value={code}
                          disabled={selectedDomains.includes(code)}
                        >
                          {info.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      onClick={addDomain}
                      disabled={!domainDropdown}
                      size="sm"
                      variant="outline"
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* Active domain tags */}
                {selectedDomains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDomains.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700"
                      >
                        {DOMAINS[d as DomainCode]?.short ?? d}
                        <button type="button" onClick={() => removeDomain(d)}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Input area (only when domains selected) */}
                {selectedDomains.length > 0 && (
                  <>
                    <ImageUpload childId={childId} onUploaded={setImageUrl} />
                    <div>
                      <Label className="text-xs text-slate-500">Note</Label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="What did you observe?"
                        className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        rows={4}
                      />
                    </div>
                    <Button
                      onClick={submitFocused}
                      disabled={loading || (!note && !imageUrl)}
                      className="w-full bg-emerald-500 hover:bg-emerald-600"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Save Observation"
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Step 2c: Progress Update — Milestone Browser */}
            {step === "form" && obsType === "progress" && (
              <div className="space-y-4">
                <MilestoneBrowser
                  milestones={milestones}
                  progressMatrix={progressMatrix}
                  selected={selectedProgress}
                  onSelect={(id, score) => {
                    const next = new Map(selectedProgress);
                    next.set(id, score);
                    setSelectedProgress(next);
                  }}
                  onDeselect={(id) => {
                    const next = new Map(selectedProgress);
                    next.delete(id);
                    setSelectedProgress(next);
                  }}
                  mode="rating"
                />

                {selectedProgress.size > 0 && (
                  <div className="sticky bottom-0 bg-slate-50 pt-2">
                    <Button
                      onClick={() => setStep("note")}
                      className="w-full bg-emerald-500 hover:bg-emerald-600"
                    >
                      Add Progress ({selectedProgress.size})
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Note step (Progress only) */}
            {step === "note" && obsType === "progress" && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="max-h-40 overflow-y-auto rounded-lg bg-blue-50 p-3">
                  <p className="mb-2 text-xs font-medium text-blue-700">
                    Selected ({selectedProgress.size})
                  </p>
                  <div className="space-y-1.5">
                    {Array.from(selectedProgress.entries()).map(
                      ([id, score]) => {
                        const m = milestones.find((ms) => ms.id === id);
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 text-xs"
                          >
                            {m && <DomainBadge domain={m.domain} />}
                            <span className="flex-1 truncate text-slate-600">
                              {m?.description ?? id}
                            </span>
                            <MasteryLabel score={score} />
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>

                {/* Skip note link */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={submitProgress}
                    disabled={loading}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Skip Note
                  </button>
                </div>

                <ImageUpload
                  childId={childId}
                  onUploaded={setProgressImageUrl}
                />

                <div>
                  <Label className="text-xs text-slate-500">
                    Note (optional)
                  </Label>
                  <textarea
                    value={progressNote}
                    onChange={(e) => setProgressNote(e.target.value)}
                    placeholder="Any additional notes..."
                    className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    rows={3}
                  />
                </div>

                <Button
                  onClick={submitProgress}
                  disabled={loading}
                  className="w-full bg-blue-500 hover:bg-blue-600"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add Observation"
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

// ---------------------------------------------------------------------------
// Type card sub-component
// ---------------------------------------------------------------------------

function TypeCard({
  icon: Icon,
  color,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          color,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
    </button>
  );
}
