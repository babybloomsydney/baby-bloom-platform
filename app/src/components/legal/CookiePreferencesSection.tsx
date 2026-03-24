'use client';

import { useState, useEffect } from 'react';
import { getCookiePrefs, setCookiePrefs, recordCookieConsent } from '@/lib/legal/cookie-utils';
import type { CookiePrefs } from '@/lib/legal/cookie-utils';

export function CookiePreferencesSection() {
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getCookiePrefs();
    if (existing) {
      setAnalytics(existing.analytics_enabled);
      setMarketing(existing.marketing_enabled);
    }
  }, []);

  const handleSave = () => {
    const choice: CookiePrefs['consent_choice'] =
      analytics && marketing
        ? 'accept_all'
        : !analytics && !marketing
          ? 'reject_non_essential'
          : 'custom';

    const prefs: CookiePrefs = {
      consent_choice: choice,
      analytics_enabled: analytics,
      marketing_enabled: marketing,
    };

    setCookiePrefs(prefs);
    recordCookieConsent(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="space-y-4">
        {/* Essential — always on */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Essential Cookies</p>
            <p className="text-xs text-slate-500">Required for the Platform to function. Cannot be disabled.</p>
          </div>
          <div className="shrink-0">
            <div className="relative h-5 w-9 rounded-full bg-violet-600 cursor-not-allowed opacity-70">
              <div className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm" />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200" />

        {/* Analytics */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Analytics Cookies</p>
            <p className="text-xs text-slate-500">Google Analytics &mdash; helps us understand how visitors use the Platform.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={analytics}
            onClick={() => setAnalytics(!analytics)}
            className={`shrink-0 relative h-5 w-9 rounded-full transition-colors ${
              analytics ? 'bg-violet-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                analytics ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="border-t border-slate-200" />

        {/* Marketing */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Marketing Cookies</p>
            <p className="text-xs text-slate-500">Google Ads &amp; Meta Pixel &mdash; used for targeted advertising and campaign measurement.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={marketing}
            onClick={() => setMarketing(!marketing)}
            className={`shrink-0 relative h-5 w-9 rounded-full transition-colors ${
              marketing ? 'bg-violet-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                marketing ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
        >
          Save Preferences
        </button>
        {saved && (
          <span className="text-xs text-emerald-600 font-medium">
            Preferences saved
          </span>
        )}
      </div>
    </div>
  );
}
