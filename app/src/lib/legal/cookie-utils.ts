export const COOKIE_KEY = 'baby_bloom_consent_preferences';
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 12 months in seconds

/**
 * Fired on `window` whenever consent prefs change, so in-page listeners (e.g.
 * the Meta pixel) can react to a grant without waiting for a page reload.
 */
export const CONSENT_CHANGED_EVENT = 'bb:consent-changed';

export interface CookiePrefs {
  consent_choice: 'accept_all' | 'reject_non_essential' | 'custom';
  analytics_enabled: boolean;
  marketing_enabled: boolean;
}

export function getCookiePrefs(): CookiePrefs | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split('=')[1]));
  } catch {
    return null;
  }
}

/**
 * True only when the visitor has granted marketing consent. Defaults to the
 * currently-stored prefs; pass explicit prefs to keep it pure/testable.
 */
export function hasMarketingConsent(
  prefs: CookiePrefs | null = getCookiePrefs(),
): boolean {
  return prefs?.marketing_enabled === true;
}

export function setCookiePrefs(prefs: CookiePrefs) {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  try {
    localStorage.setItem(COOKIE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage is a secondary backup; consent is already stored in the
    // cookie above (private browsing / quota errors are non-fatal here).
  }
  // Notify in-page listeners (e.g. the Meta pixel) so a consent grant takes
  // effect immediately, without a full page reload.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: prefs }));
  }
}

export function getVisitorId(): string {
  const key = 'baby_bloom_visitor_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export async function recordCookieConsent(prefs: CookiePrefs) {
  try {
    await fetch('/api/legal/cookie-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitor_id: getVisitorId(),
        ...prefs,
      }),
    });
  } catch {
    // Non-blocking
  }
}
