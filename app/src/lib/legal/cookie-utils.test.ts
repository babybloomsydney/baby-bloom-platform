/**
 * Consent helpers — the Meta pixel gates on `hasMarketingConsent`, and mounts
 * the instant consent is granted via the CONSENT_CHANGED_EVENT that
 * setCookiePrefs dispatches. Both are load-bearing for the privacy gate, so
 * they're covered here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setCookiePrefs,
  getCookiePrefs,
  hasMarketingConsent,
  recordCookieConsent,
  CONSENT_CHANGED_EVENT,
  COOKIE_KEY,
  type CookiePrefs,
} from "./cookie-utils";

const acceptAll: CookiePrefs = {
  consent_choice: "accept_all",
  analytics_enabled: true,
  marketing_enabled: true,
};
const rejectAll: CookiePrefs = {
  consent_choice: "reject_non_essential",
  analytics_enabled: false,
  marketing_enabled: false,
};

beforeEach(() => {
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe("hasMarketingConsent", () => {
  it("is false for null prefs", () => {
    expect(hasMarketingConsent(null)).toBe(false);
  });

  it("is true when marketing is enabled", () => {
    expect(hasMarketingConsent(acceptAll)).toBe(true);
  });

  it("is false when marketing is disabled", () => {
    expect(hasMarketingConsent(rejectAll)).toBe(false);
  });

  it("reads the currently-stored prefs when none are passed", () => {
    expect(hasMarketingConsent()).toBe(false);
    setCookiePrefs(acceptAll);
    expect(hasMarketingConsent()).toBe(true);
  });
});

describe("setCookiePrefs", () => {
  it("persists prefs (round-trips through getCookiePrefs)", () => {
    setCookiePrefs(acceptAll);
    expect(getCookiePrefs()?.marketing_enabled).toBe(true);
  });

  it("dispatches CONSENT_CHANGED_EVENT carrying the new prefs", () => {
    const listener = vi.fn();
    window.addEventListener(CONSENT_CHANGED_EVENT, listener);
    setCookiePrefs(acceptAll);
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual(acceptAll);
  });
});

describe("getCookiePrefs", () => {
  it("returns null for a malformed cookie", () => {
    document.cookie = `${COOKIE_KEY}=not-json; path=/`;
    expect(getCookiePrefs()).toBeNull();
  });
});

describe("recordCookieConsent", () => {
  it("POSTs the consent + a visitor id to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await recordCookieConsent(acceptAll);
    vi.unstubAllGlobals();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/legal/cookie-consent");
    const body = JSON.parse(String(init.body));
    expect(body.marketing_enabled).toBe(true);
    expect(typeof body.visitor_id).toBe("string");
  });

  it("never throws when the request fails (non-blocking)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(recordCookieConsent(acceptAll)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
