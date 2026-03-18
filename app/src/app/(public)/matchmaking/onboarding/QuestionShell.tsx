"use client";

import { useState, useEffect } from "react";
import { ChevronLeft } from "lucide-react";

interface QuestionShellProps {
  question: string;
  subtitle?: string;
  progress: number;
  showBack: boolean;
  onBack: () => void;
  children: React.ReactNode;
}

export function QuestionShell({
  question,
  subtitle,
  progress,
  showBack,
  onBack,
  children,
}: QuestionShellProps) {
  const [questionVisible, setQuestionVisible] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);

  useEffect(() => {
    // Question text fades in after 1 frame
    const frame = requestAnimationFrame(() => setQuestionVisible(true));
    // Options slide up after 500ms
    const timer = setTimeout(() => setOptionsVisible(true), 500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative flex flex-col h-[calc(100vh-10rem)]">
      {/* Progress bar */}
      <div className="-mx-4 -mt-4 lg:-mx-6 lg:-mt-6">
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-violet-600 transition-all duration-500 ease-out rounded-r-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Back arrow */}
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute top-3 left-0 p-1.5 text-slate-400 hover:text-slate-600 transition-colors z-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {/* Question text — centered on page */}
      <div
        className={`flex-1 flex items-center justify-center px-4 transition-opacity duration-300 ${
          questionVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="text-center max-w-lg">
          {question && (
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 leading-snug">
              {question}
            </h2>
          )}
          {subtitle && (
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Options — pinned to bottom, staggered entrance */}
      <div
        className={`w-full max-w-md mx-auto pb-6 px-2 transition-all duration-500 ease-out ${
          optionsVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
