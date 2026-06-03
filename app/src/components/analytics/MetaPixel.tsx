"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CONSENT_CHANGED_EVENT,
  hasMarketingConsent,
} from "@/lib/legal/cookie-utils";
import { initMetaPixel, metaPixelPageView } from "@/lib/analytics/meta/browser";

/**
 * Consent-gated Meta pixel loader. Renders nothing; once marketing consent is
 * present it installs the base pixel and fires PageView on first load + every
 * client-side route change (mirrors VisitorTracker's nav pattern).
 *
 * Loads ONLY when `NEXT_PUBLIC_META_PIXEL_ID` is set AND the visitor has
 * granted marketing consent — and reacts live to the cookie banner via
 * CONSENT_CHANGED_EVENT, so a grant takes effect without a reload. A missing
 * pixel id or absent consent is a pure no-op.
 *
 * Spec: system/FB/Plan/01-A-pixel-setup-build-plan.md (A1, AC1).
 */
export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const pathname = usePathname();
  const [consented, setConsented] = useState(false);
  const loaded = useRef(false);
  const lastPageViewPath = useRef<string | null>(null);

  // Track marketing consent: initial read + live updates from the cookie banner.
  useEffect(() => {
    const sync = () => setConsented(hasMarketingConsent());
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  // Install the pixel on first consent, then count a PageView per route change.
  useEffect(() => {
    if (!pixelId || !consented) return;
    if (!loaded.current) {
      initMetaPixel(pixelId);
      loaded.current = true;
    }
    if (lastPageViewPath.current === pathname) return;
    lastPageViewPath.current = pathname;
    metaPixelPageView();
  }, [pixelId, consented, pathname]);

  return null;
}
