/**
 * MetaPixel is the privacy gate for the whole pixel: it must stay inert
 * without a pixel id or marketing consent, mount the instant consent is
 * granted, and count exactly one PageView per route change (never re-init).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pathname: "/", consent: false }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/legal/cookie-utils", () => ({
  CONSENT_CHANGED_EVENT: "bb:consent-changed",
  hasMarketingConsent: () => mocks.consent,
}));
vi.mock("@/lib/analytics/meta/browser", () => ({
  initMetaPixel: vi.fn(),
  metaPixelPageView: vi.fn(),
}));

import { MetaPixel } from "./MetaPixel";
import { initMetaPixel, metaPixelPageView } from "@/lib/analytics/meta/browser";

beforeEach(() => {
  mocks.pathname = "/";
  mocks.consent = false;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "123";
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe("MetaPixel", () => {
  it("does nothing without consent", () => {
    render(<MetaPixel />);
    expect(initMetaPixel).not.toHaveBeenCalled();
    expect(metaPixelPageView).not.toHaveBeenCalled();
  });

  it("does nothing when no pixel id is configured", () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    mocks.consent = true;
    render(<MetaPixel />);
    expect(initMetaPixel).not.toHaveBeenCalled();
  });

  it("loads the pixel + fires PageView when consent is present", () => {
    mocks.consent = true;
    render(<MetaPixel />);
    expect(initMetaPixel).toHaveBeenCalledWith("123");
    expect(metaPixelPageView).toHaveBeenCalledTimes(1);
  });

  it("reacts to a live consent grant via CONSENT_CHANGED_EVENT", () => {
    render(<MetaPixel />);
    expect(initMetaPixel).not.toHaveBeenCalled();
    mocks.consent = true;
    act(() => {
      window.dispatchEvent(new CustomEvent("bb:consent-changed"));
    });
    expect(initMetaPixel).toHaveBeenCalledWith("123");
    expect(metaPixelPageView).toHaveBeenCalledTimes(1);
  });

  it("fires PageView on route change but never re-initialises", () => {
    mocks.consent = true;
    const { rerender } = render(<MetaPixel />);
    expect(metaPixelPageView).toHaveBeenCalledTimes(1);

    mocks.pathname = "/nannies";
    rerender(<MetaPixel />);

    expect(metaPixelPageView).toHaveBeenCalledTimes(2);
    expect(initMetaPixel).toHaveBeenCalledTimes(1);
  });

  it("stops firing PageView after consent is revoked", () => {
    mocks.consent = true;
    const { rerender } = render(<MetaPixel />);
    expect(metaPixelPageView).toHaveBeenCalledTimes(1);

    // Revoke, then navigate — no further PageViews while consent is withdrawn.
    mocks.consent = false;
    act(() => {
      window.dispatchEvent(new CustomEvent("bb:consent-changed"));
    });
    mocks.pathname = "/nannies";
    rerender(<MetaPixel />);

    expect(metaPixelPageView).toHaveBeenCalledTimes(1);
  });
});
