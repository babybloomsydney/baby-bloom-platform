'use client';

import { ReactNode } from 'react';

interface ProgressiveRevealProps {
  show: boolean;
  children: ReactNode;
  className?: string;
}

export function ProgressiveReveal({ show, children, className = '' }: ProgressiveRevealProps) {
  return (
    <div
      className={`transition-all duration-500 ease-in-out ${
        show ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
      } ${className}`}
    >
      {children}
    </div>
  );
}
