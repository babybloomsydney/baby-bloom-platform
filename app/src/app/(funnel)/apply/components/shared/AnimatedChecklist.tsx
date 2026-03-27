'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

interface ChecklistItem {
  label: string;
  value: string;
}

interface AnimatedChecklistProps {
  items: ChecklistItem[];
  onComplete: () => void;
  intervalMs?: number;
}

export function AnimatedChecklist({ items, onComplete, intervalMs = 900 }: AnimatedChecklistProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount < items.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, intervalMs);
      return () => clearTimeout(timer);
    } else if (visibleCount === items.length && items.length > 0) {
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, items.length, onComplete, intervalMs]);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          key={index}
          className={`flex items-center gap-3 transition-all duration-500 ${
            index < visibleCount
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4'
          }`}
        >
          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
            index < visibleCount ? 'bg-emerald-500 scale-100' : 'bg-slate-200 scale-75'
          }`}>
            {index < visibleCount && (
              <Check className="w-4 h-4 text-white animate-in zoom-in duration-300" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 uppercase tracking-wider">{item.label}</span>
            <span className="text-sm text-slate-700 font-medium">{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
