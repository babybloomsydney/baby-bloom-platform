/**
 * Browser pixel wrapper — fires the same event the CAPI helper fires,
 * tagged with the SAME event_id so Meta deduplicates the pair. Must be a
 * safe no-op when fbq hasn't loaded (consent not granted / script blocked)
 * so it never throws from a render or click path.
 *
 * Spec: system/FB/Plan/01-A-pixel-setup-build-plan.md (A1/A2/A3).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  trackMetaBrowserEvent,
  isMetaPixelReady,
  metaPixelPageView,
  initMetaPixel,
} from "./browser";
import { META_EVENTS } from "./events";

afterEach(() => {
  vi.restoreAllMocks();
  window.fbq = undefined;
});

describe("trackMetaBrowserEvent", () => {
  it("calls fbq('track', name, customData, { eventID }) when fbq is present", () => {
    const fbq = vi.fn();
    window.fbq = fbq;
    trackMetaBrowserEvent(META_EVENTS.quickMatchCompleted, {
      eventId: "evt-9",
      customData: { content_category: "parent" },
    });
    expect(fbq).toHaveBeenCalledWith(
      "track",
      "QuickMatchCompleted",
      { content_category: "parent" },
      { eventID: "evt-9" },
    );
  });

  it("passes an empty object for customData when none is supplied", () => {
    const fbq = vi.fn();
    window.fbq = fbq;
    trackMetaBrowserEvent(META_EVENTS.submitApplication, { eventId: "evt-11" });
    expect(fbq).toHaveBeenCalledWith(
      "track",
      "SubmitApplication",
      {},
      { eventID: "evt-11" },
    );
  });

  it("is a no-op (does not throw) when fbq is absent", () => {
    window.fbq = undefined;
    expect(() =>
      trackMetaBrowserEvent(META_EVENTS.submitApplication, { eventId: "evt-10" }),
    ).not.toThrow();
  });

  it("swallows errors thrown by fbq but logs them (never breaks the caller)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    window.fbq = vi.fn(() => {
      throw new Error("fbq blew up");
    });
    expect(() =>
      trackMetaBrowserEvent(META_EVENTS.purchase, { eventId: "evt-12" }),
    ).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("metaPixelPageView", () => {
  it("calls fbq('track', 'PageView') when ready", () => {
    const fbq = vi.fn();
    window.fbq = fbq;
    metaPixelPageView();
    expect(fbq).toHaveBeenCalledWith("track", "PageView");
  });

  it("is a no-op (does not throw) when fbq is absent", () => {
    window.fbq = undefined;
    expect(() => metaPixelPageView()).not.toThrow();
  });
});

describe("initMetaPixel", () => {
  afterEach(() => {
    window.fbq = undefined;
    window._fbq = undefined;
    document
      .querySelectorAll('script[src*="fbevents.js"]')
      .forEach((s) => s.remove());
  });

  it("installs fbq + injects the events library once (idempotent)", () => {
    initMetaPixel("123");
    expect(typeof window.fbq).toBe("function");
    expect(
      document.querySelectorAll('script[src*="fbevents.js"]').length,
    ).toBe(1);
    initMetaPixel("123");
    expect(
      document.querySelectorAll('script[src*="fbevents.js"]').length,
    ).toBe(1);
  });

  it("no-ops when pixelId is empty", () => {
    initMetaPixel("");
    expect(window.fbq).toBeUndefined();
    expect(
      document.querySelectorAll('script[src*="fbevents.js"]').length,
    ).toBe(0);
  });

  it("queues calls made before the library finishes loading", () => {
    initMetaPixel("123");
    window.fbq?.("track", "PageView");
    const fbq = window.fbq as unknown as { queue: unknown[] };
    expect(fbq.queue.length).toBeGreaterThan(0);
  });
});

describe("isMetaPixelReady", () => {
  it("is false when fbq is absent, true when present", () => {
    window.fbq = undefined;
    expect(isMetaPixelReady()).toBe(false);
    window.fbq = vi.fn();
    expect(isMetaPixelReady()).toBe(true);
  });
});
