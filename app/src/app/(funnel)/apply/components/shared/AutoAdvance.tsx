'use client';

import { useEffect, useRef } from 'react';

interface AutoAdvanceProps {
  shouldAdvance: boolean;
  onAdvance: () => void;
  delay?: number;
}

export function AutoAdvance({ shouldAdvance, onAdvance, delay = 300 }: AutoAdvanceProps) {
  // Start as true if condition already met (restored state) — prevents auto-advance on back-nav
  const hasAdvanced = useRef(shouldAdvance);

  useEffect(() => {
    if (shouldAdvance && !hasAdvanced.current) {
      hasAdvanced.current = true;
      const timer = setTimeout(onAdvance, delay);
      return () => clearTimeout(timer);
    }
    if (!shouldAdvance) {
      hasAdvanced.current = false;
    }
  }, [shouldAdvance, onAdvance, delay]);

  return null;
}
