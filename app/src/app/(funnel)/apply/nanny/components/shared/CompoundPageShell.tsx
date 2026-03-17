'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';

interface CompoundPageShellProps {
  title: string;
  subtitle?: string;
  progress: number;
  showBack: boolean;
  onBack: () => void;
  questionNumber?: string;
  children: React.ReactNode;
}

export function CompoundPageShell({
  title,
  subtitle,
  progress,
  showBack,
  onBack,
  questionNumber,
  children,
}: CompoundPageShellProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [title]);

  return (
    <div className="relative flex flex-col min-h-[calc(100vh-10rem)]">
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

      {/* Content */}
      <div
        className={`flex-1 pt-10 pb-6 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Title */}
        <div className="text-center mb-6">
          {questionNumber && (
            <span className="text-xs text-slate-300 font-medium tracking-wide">{questionNumber}</span>
          )}
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-800 leading-snug">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
              {subtitle}
            </p>
          )}
        </div>

        {/* Scrollable form content */}
        <div className="max-w-md mx-auto px-2 pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}
