"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  TypeformFormData,
  DAY_OPTIONS,
  DAY_SHORT,
  TIME_BLOCK_OPTIONS,
  DAY_ROSTER_FIELD,
} from "../questions";

interface DaysTimesCompoundProps {
  data: Partial<TypeformFormData>;
  updateData: (d: Partial<TypeformFormData>) => void;
  onAdvance: () => void;
  question?: string;
}

export function DaysTimesCompound({
  data,
  updateData,
  onAdvance,
  question,
}: DaysTimesCompoundProps) {
  const weeklyRoster = data.weekly_roster ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);
  const [questionVisible, setQuestionVisible] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  // Staggered entrance — mirrors QuestionShell
  useEffect(() => {
    const frame = requestAnimationFrame(() => setQuestionVisible(true));
    const timer = setTimeout(() => setContentVisible(true), 500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  // Auto-scroll when grid appears
  useEffect(() => {
    if (weeklyRoster.length > 0 && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [weeklyRoster.length]);

  const toggleDay = (day: string) => {
    if (weeklyRoster.includes(day)) {
      // Toggle off — reset that day's brackets
      const fieldKey = DAY_ROSTER_FIELD[day];
      updateData({
        weekly_roster: weeklyRoster.filter((d) => d !== day),
        [fieldKey]: [],
      });
    } else {
      updateData({ weekly_roster: [...weeklyRoster, day] });
    }
  };

  const toggleTimeBlock = (day: string, blockKey: string) => {
    const fieldKey = DAY_ROSTER_FIELD[day];
    const current = (data[fieldKey] as string[] | undefined) ?? [];
    const updated = current.includes(blockKey)
      ? current.filter((b) => b !== blockKey)
      : [...current, blockKey];
    updateData({ [fieldKey]: updated });
  };

  // Sort selected days in week order
  const sortedSelectedDays = DAY_OPTIONS.filter((d) =>
    weeklyRoster.includes(d)
  );

  // Continue only when every selected day has at least one bracket
  const allDaysHaveBrackets =
    sortedSelectedDays.length > 0 &&
    sortedSelectedDays.every((day) => {
      const fieldKey = DAY_ROSTER_FIELD[day];
      const times = (data[fieldKey] as string[] | undefined) ?? [];
      return times.length > 0;
    });

  const dayButton = (day: string) => (
    <button
      key={day}
      type="button"
      onClick={() => toggleDay(day)}
      className={`px-2 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
        weeklyRoster.includes(day)
          ? "bg-violet-500 text-white border-violet-500"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {DAY_SHORT[day]}
    </button>
  );

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto">
      {/* Centered group — heading + day grid + time grid as one block */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col gap-6 w-full px-2">
          {/* Heading — fade in */}
          {question && (
            <h2 className={`text-xl sm:text-2xl font-semibold text-slate-800 leading-snug text-center transition-opacity duration-300 ${
              questionVisible ? "opacity-100" : "opacity-0"
            }`}>
              {question}
            </h2>
          )}

          {/* Day selection + time grid — slide up together */}
          <div className={`flex flex-col gap-6 transition-all duration-500 ease-out ${
            contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                {DAY_OPTIONS.slice(0, 4).map((day) => dayButton(day))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DAY_OPTIONS.slice(4).map((day) => dayButton(day))}
              </div>
            </div>

            {/* Time bracket grid */}
            {sortedSelectedDays.length > 0 && (
              <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700 text-center">
                When during the day?
              </p>

              <div className="overflow-x-auto">
                <div className="min-w-[320px]">
                  {/* Column headers */}
                  <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1">
                    <div />
                    {TIME_BLOCK_OPTIONS.map((block) => (
                      <div key={block.key} className="text-center">
                        <p className="text-[11px] font-semibold text-slate-600">
                          {block.label}
                        </p>
                        <p className="text-[9px] text-slate-400">
                          {block.sublabel}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Day rows */}
                  {sortedSelectedDays.map((day) => {
                    const fieldKey = DAY_ROSTER_FIELD[day];
                    const currentTimes =
                      (data[fieldKey] as string[] | undefined) ?? [];

                    return (
                      <div
                        key={day}
                        className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1"
                      >
                        <div className="flex items-center">
                          <p className="text-xs font-semibold text-slate-600">
                            {DAY_SHORT[day]}
                          </p>
                        </div>
                        {TIME_BLOCK_OPTIONS.map((block) => {
                          const isSelected = currentTimes.includes(block.key);
                          return (
                            <button
                              key={block.key}
                              type="button"
                              onClick={() => toggleTimeBlock(day, block.key)}
                              className={`h-9 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-violet-500 text-white border-violet-500"
                                  : "bg-white text-slate-400 border-slate-200 hover:border-violet-400"
                              }`}
                            >
                              {isSelected ? "\u2713" : ""}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Continue — pinned to bottom, matching QuestionShell position */}
      <div className={`w-full pb-12 px-2 transition-all duration-500 ease-out ${
        contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}>
        {allDaysHaveBrackets && (
          <Button
            onClick={onAdvance}
            className="w-full h-11 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium text-sm"
          >
            Continue
          </Button>
        )}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
