'use client';

import { useState, useEffect } from 'react';
import { getCookiePrefs, setCookiePrefs, recordCookieConsent } from '@/lib/legal/cookie-utils';
import type { CookiePrefs } from '@/lib/legal/cookie-utils';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = getCookiePrefs();
    if (!existing) {
      setVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    const prefs: CookiePrefs = {
      consent_choice: 'accept_all',
      analytics_enabled: true,
      marketing_enabled: true,
    };
    setCookiePrefs(prefs);
    recordCookieConsent(prefs);
    setVisible(false);
  };

  const handleRejectNonEssential = () => {
    const prefs: CookiePrefs = {
      consent_choice: 'reject_non_essential',
      analytics_enabled: false,
      marketing_enabled: false,
    };
    setCookiePrefs(prefs);
    recordCookieConsent(prefs);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-violet-100 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl flex items-center gap-3 px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
          We use cookies.{' '}
          <a href="/legal/cookies" className="text-violet-600 underline-offset-2 hover:underline">
            Policy
          </a>
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleAcceptAll}
            className="rounded bg-violet-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-violet-700 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={handleRejectNonEssential}
            className="rounded border border-violet-200 px-2.5 py-0.5 text-[11px] font-medium text-violet-600 hover:bg-violet-50 transition-colors"
          >
            Decline
          </button>
          <a
            href="/legal/cookies#preferences"
            className="rounded px-2 py-0.5 text-[11px] text-violet-400 hover:text-violet-600 transition-colors"
          >
            Manage
          </a>
        </div>
      </div>
    </div>
  );
}
