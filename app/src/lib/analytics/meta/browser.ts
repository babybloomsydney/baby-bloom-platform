/**
 * Browser pixel wrapper — fires a Meta event through the already-loaded
 * `fbq` global, tagged with the same `event_id` the server CAPI copy uses
 * so Meta deduplicates the pair. Safe no-op when `fbq` is absent (consent
 * not yet granted, script still loading, or blocked) so it never throws
 * from a render or click path.
 *
 * The base pixel bootstrap (the `fbq` snippet) is injected consent-gated in
 * the root layout; this module assumes it may or may not be present.
 *
 * Spec: system/FB/Plan/01-A-pixel-setup-build-plan.md (A1/A2/A3).
 */
import type { MetaEventName, MetaCustomData } from "./events";

/** The `fbq` bootstrap stub Meta's snippet installs before fbevents.js loads. */
interface FbqStub {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

const FBEVENTS_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * Install + initialise the Meta base pixel (the standard `fbq` bootstrap),
 * idempotently — safe to call repeatedly; the events library is injected only
 * once. Call this ONLY after marketing consent is granted (the consent gate
 * lives in the MetaPixel component). No-op on the server or when no pixel id is
 * configured (e.g. before A0's env var is set).
 */
export function initMetaPixel(pixelId: string): void {
  if (typeof window === "undefined" || !pixelId) return;
  if (window.fbq) return; // already installed + initialised — nothing to do

  const fbq = function (...args: unknown[]): void {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as FbqStub;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = FBEVENTS_SRC;
  document.head.appendChild(script);

  window.fbq("init", pixelId);
}

export function isMetaPixelReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

export interface TrackMetaBrowserEventOptions {
  /** Shared with the server CAPI copy → Meta dedup. */
  eventId: string;
  customData?: MetaCustomData;
}

function logPixelError(eventName: string, err: unknown): void {
  // The pixel must never break a render/click — but a thrown fbq means the
  // browser pipeline is broken, so surface it rather than swallowing silently.
  console.error(
    `[Meta pixel] ${eventName} failed:`,
    err instanceof Error ? err.message : String(err),
  );
}

export function trackMetaBrowserEvent(
  eventName: MetaEventName,
  options: TrackMetaBrowserEventOptions,
): void {
  if (!isMetaPixelReady()) return;
  try {
    window.fbq?.("track", eventName, options.customData ?? {}, {
      eventID: options.eventId,
    });
  } catch (err) {
    logPixelError(eventName, err);
  }
}

export function metaPixelPageView(): void {
  if (!isMetaPixelReady()) return;
  try {
    window.fbq?.("track", "PageView");
  } catch (err) {
    logPixelError("PageView", err);
  }
}
