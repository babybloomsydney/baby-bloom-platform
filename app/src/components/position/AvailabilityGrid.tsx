"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { TIME_BRACKETS, BRACKET_KEYS, getNext7Days } from "@/lib/timezone";

export function AvailabilityGrid({
  onConfirm,
  onBack,
  submitting,
}: {
  onConfirm: (slots: string[]) => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const next7Days = getNext7Days();
  const allSlots = next7Days.flatMap((day) =>
    BRACKET_KEYS.map((bracket) => `${day.date}_${bracket}`)
  );

  const toggleSlot = (slot: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    );
  };

  const selectAll = () => setSelectedSlots([...allSlots]);
  const clearAll = () => setSelectedSlots([]);

  const selectedBrackets = new Set(selectedSlots.map((s) => s.split("_")[1]));
  const selectedDays = new Set(selectedSlots.map((s) => s.split("_")[0]));
  const hasEnoughSlots = selectedSlots.length >= 5;
  const hasAllBrackets = selectedBrackets.size >= 4;
  const hasEnoughDays = selectedDays.size >= 3;
  const isValid = hasEnoughSlots && hasAllBrackets && hasEnoughDays;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">
          When are you available for a meet and greet?
        </p>
        <p className="text-xs text-slate-500">
          Select at least 5 slots across all time brackets and 3+ days.
        </p>
      </div>

      {/* Anytime / Clear buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={selectedSlots.length === allSlots.length ? clearAll : selectAll}
          className={selectedSlots.length === allSlots.length ? "bg-violet-100 border-violet-300 text-violet-700" : ""}
        >
          {selectedSlots.length === allSlots.length ? "Clear All" : "Anytime"}
        </Button>
        {selectedSlots.length > 0 && selectedSlots.length < allSlots.length && (
          <span className="text-xs text-slate-500 self-center">
            {selectedSlots.length} selected
          </span>
        )}
      </div>

      {/* Grid — dates as rows, brackets as columns */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="min-w-[360px]">
          {/* Bracket column headers */}
          <div className="grid grid-cols-[90px_repeat(4,1fr)] gap-1 mb-1">
            <div />
            {BRACKET_KEYS.map((bracket) => (
              <div key={bracket} className="text-center">
                <p className="text-xs font-semibold text-slate-600">{TIME_BRACKETS[bracket].label}</p>
                <p className="text-[10px] text-slate-400">{TIME_BRACKETS[bracket].sublabel}</p>
              </div>
            ))}
          </div>

          {/* Date rows */}
          {next7Days.map((day) => (
            <div key={day.date} className="grid grid-cols-[90px_repeat(4,1fr)] gap-1 mb-1">
              <div className="flex items-center">
                <div>
                  <p className="text-xs font-semibold text-slate-600">{day.dayLabel}</p>
                  <p className="text-[10px] text-slate-400">{day.dateLabel}</p>
                </div>
              </div>
              {BRACKET_KEYS.map((bracket) => {
                const slot = `${day.date}_${bracket}`;
                const isSelected = selectedSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className={`h-10 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-slate-400 border-slate-200 hover:border-violet-400"
                    }`}
                  >
                    {isSelected ? "\u2713" : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Validation hints */}
      <div className="space-y-1">
        <p className={`text-xs ${hasEnoughSlots ? "text-green-600" : "text-slate-400"}`}>
          {hasEnoughSlots ? "\u2713" : "\u25CB"} At least 5 slots selected ({selectedSlots.length}/5)
        </p>
        <p className={`text-xs ${hasAllBrackets ? "text-green-600" : "text-slate-400"}`}>
          {hasAllBrackets ? "\u2713" : "\u25CB"} All 4 time brackets covered ({selectedBrackets.size}/4)
        </p>
        <p className={`text-xs ${hasEnoughDays ? "text-green-600" : "text-slate-400"}`}>
          {hasEnoughDays ? "\u2713" : "\u25CB"} At least 3 different days ({selectedDays.size}/3)
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </Button>
        <Button
          className="flex-1 bg-violet-500 hover:bg-violet-600"
          disabled={!isValid || submitting}
          onClick={() => onConfirm(selectedSlots)}
        >
          {submitting ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming...</>
          ) : (
            "Confirm Availability"
          )}
        </Button>
      </div>
    </div>
  );
}
