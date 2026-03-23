'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

function getVisitorId(): string {
  const key = 'bb-visitor-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function VisitorTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastTrackedPath.current) return;
    lastTrackedPath.current = pathname;

    try {
      const visitorId = getVisitorId();

      // Parse UTM params from current URL (only present on landing from ads/campaigns)
      const params = new URLSearchParams(window.location.search);
      const utm_source = params.get('utm_source') || undefined;
      const utm_medium = params.get('utm_medium') || undefined;
      const utm_campaign = params.get('utm_campaign') || undefined;
      const utm_content = params.get('utm_content') || undefined;

      fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: visitorId,
          page_path: pathname,
          referrer: document.referrer || null,
          ...(utm_source && { utm_source }),
          ...(utm_medium && { utm_medium }),
          ...(utm_campaign && { utm_campaign }),
          ...(utm_content && { utm_content }),
        }),
      }).catch(() => {
        // Silently fail — analytics should never break the app
      });
    } catch {
      // localStorage might not be available (SSR guard)
    }
  }, [pathname]);

  return null;
}
