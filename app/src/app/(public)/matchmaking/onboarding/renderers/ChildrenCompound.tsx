"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TypeformFormData, AGE_OPTIONS, GENDER_OPTIONS } from "../questions";

const CHILD_LABELS = ["First Child", "Second Child", "Third Child"];
const NUM_OPTIONS = ["1", "2", "3"];

interface ChildrenCompoundProps {
  data: Partial<TypeformFormData>;
  updateData: (d: Partial<TypeformFormData>) => void;
  onAdvance: () => void;
  question?: string;
}

const AGE_KEYS: (keyof TypeformFormData)[] = [
  "child_a_age",
  "child_b_age",
  "child_c_age",
];
const GENDER_KEYS: (keyof TypeformFormData)[] = [
  "child_a_gender",
  "child_b_gender",
  "child_c_gender",
];

export function ChildrenCompound({
  data,
  updateData,
  onAdvance,
  question,
}: ChildrenCompoundProps) {
  const numChildren = data.num_children;
  const numStr = numChildren != null ? String(numChildren) : null;
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when child cards appear
  useEffect(() => {
    if (numChildren != null && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [numChildren]);

  // Toggle: click selected number to deselect
  const handleNumClick = (opt: string) => {
    if (numStr === opt) {
      updateData({ num_children: null });
    } else {
      updateData({ num_children: parseInt(opt, 10) });
    }
  };

  // Check if all visible children have age and gender filled
  const allChildrenFilled =
    numChildren != null &&
    Array.from({ length: numChildren }).every((_, i) => {
      const age = data[AGE_KEYS[i]] as string | null | undefined;
      const gender = data[GENDER_KEYS[i]] as string | null | undefined;
      return age && gender;
    });

  const hasChildren = numChildren != null;

  if (!hasChildren) {
    /* ── STATE 1: No selection yet ── QuestionShell layout:
       heading centered in page, number tiles pinned at bottom */
    return (
      <div className="flex flex-col h-full w-full max-w-md mx-auto">
        <div className="flex-1 flex items-center justify-center px-4">
          {question && (
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 leading-snug text-center">
              {question}
            </h2>
          )}
        </div>
        <div className="w-full px-2 pb-6">
          <div className="grid grid-cols-3 gap-2">
            {NUM_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNumClick(opt)}
                className="px-3 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── STATE 2: Children selected ── everything as one centered group */
  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto">
      <div className="flex-1 flex items-center justify-center overflow-y-auto py-4">
        <div className="flex flex-col gap-6 w-full px-2">
          {question && (
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 leading-snug text-center">
              {question}
            </h2>
          )}

          <div className="grid grid-cols-3 gap-2">
            {NUM_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleNumClick(opt)}
                className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-center cursor-pointer transition-all duration-150 ${
                  numStr === opt
                    ? "bg-violet-500 text-white border-violet-500"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {Array.from({ length: numChildren }).map((_, i) => {
              const age =
                (data[AGE_KEYS[i]] as string | null | undefined) ?? null;
              const gender =
                (data[GENDER_KEYS[i]] as string | null | undefined) ?? null;

              return (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-3"
                >
                  <p className="text-sm font-semibold text-slate-700">
                    {CHILD_LABELS[i]}
                  </p>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">
                      Age
                    </label>
                    <select
                      value={age ?? ""}
                      onChange={(e) =>
                        updateData({
                          [AGE_KEYS[i]]: e.target.value || null,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                    >
                      <option value="">Select age range</option>
                      {AGE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">
                      Gender
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {GENDER_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            updateData({ [GENDER_KEYS[i]]: opt })
                          }
                          className={`px-2 py-2 rounded-lg border text-xs font-medium text-center cursor-pointer transition-colors ${
                            gender === opt
                              ? "bg-violet-500 text-white border-violet-500"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {allChildrenFilled && (
            <Button
              onClick={onAdvance}
              className="w-full h-11 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium text-sm"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
