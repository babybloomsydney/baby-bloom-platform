'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface RollingSpinnerProps {
  messages: string[];
  onComplete: () => void;
  intervalMs?: number;
  minCycles?: number;
  readyToComplete?: boolean;
}

export function RollingSpinner({
  messages,
  onComplete,
  intervalMs = 2500,
  minCycles = 1,
  readyToComplete = true,
}: RollingSpinnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [fading, setFading] = useState(false);

  const advance = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % messages.length;
        if (next === 0) {
          setCycleCount((c) => c + 1);
        }
        return next;
      });
      setFading(false);
    }, 300);
  }, [messages.length]);

  useEffect(() => {
    if (cycleCount >= minCycles && readyToComplete && currentIndex === messages.length - 1) {
      const timer = setTimeout(onComplete, intervalMs);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(advance, intervalMs);
    return () => clearTimeout(timer);
  }, [currentIndex, cycleCount, minCycles, readyToComplete, advance, intervalMs, onComplete, messages.length]);

  return (
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      <p
        className={`text-sm text-slate-600 text-center transition-opacity duration-300 ${
          fading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {messages[currentIndex]}
      </p>
    </div>
  );
}
