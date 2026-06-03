/**
 * Shared client-side image compression utility.
 *
 * Extracted from `src/components/bapp/shared/ImageUpload.tsx` per T-028
 * Wave 1 — generalises HOTFIX-01 (commit 7ba16ac) so every media-upload
 * surface can re-use the same logic.
 *
 * Why this exists: Vercel's default 4.5 MB serverless body limit drops
 * oversize multipart requests at the edge BEFORE they reach our route
 * handler. iPhone HEIC + HDR + Live-Photo captures from the Photos
 * library routinely exceed 4.5 MB. Re-encoding to JPEG at ≤2 MB on the
 * client side prevents the silent edge-drop and turns previously-broken
 * uploads into successful ones.
 *
 * Scope note: this utility is for MEDIA surfaces (FAB feed, profile
 * pictures, gallery, funnel, share, chat). Verification surfaces
 * (passport, selfie, WWCC, parent ID) ship under a separate utility per
 * T-029 with stricter parameters and explicit EXIF-orientation handling.
 * Do NOT import this for those flows.
 */

/** Target max bytes for the output. 2 MB comfortably fits Vercel's 4.5 MB
 *  body limit with multipart overhead. */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Max longest edge in pixels. 2000 covers retina-density rendering at
 *  feed + profile sizes without being wasteful. */
const DEFAULT_MAX_DIMENSION = 2000;

/** JPEG quality ladder. Tries each in order; returns the first result
 *  under maxBytes. If none fit, returns the LAST entry's result — a
 *  degraded photo is better than a failed upload.
 *
 *  Note: the original HOTFIX-01 inline impl tried [0.85..0.45] then
 *  did a separate "last-resort" call at 0.35. This shared utility
 *  collapses the two into a single ladder — the last entry IS the
 *  last-resort. Behavioural outcome is identical (both shapes return
 *  the 0.35 result when the ladder is exhausted) and the single-list
 *  shape lets callers configure the entire policy via the `qualities`
 *  option without a hidden floor. */
const DEFAULT_QUALITIES: readonly number[] = [
  0.85, 0.75, 0.65, 0.55, 0.45, 0.35,
];

export interface CompressOptions {
  /** Default {@link DEFAULT_MAX_BYTES}. */
  maxBytes?: number;
  /** Default {@link DEFAULT_MAX_DIMENSION}. */
  maxDimension?: number;
  /** Default {@link DEFAULT_QUALITIES}. The LAST entry is the floor —
   *  if every quality produces a too-large blob, the last entry's
   *  result is returned regardless of size. */
  qualities?: readonly number[];
  /** If true, always re-encode even if the file would normally fast-path
   *  (small + web-renderable). Default false. */
  forceReencode?: boolean;
}

/**
 * Re-encode and (if needed) downscale a user-picked image so the upload
 * fits Vercel's body limit.
 *
 * Behaviour:
 *   - Fast path: small + web-renderable + `forceReencode === false` →
 *     returns the original `File` reference unchanged.
 *   - HEIC/HEIF (by MIME or extension): always re-encoded — HEIC is not
 *     a web-renderable format on most desktop browsers.
 *   - Anything else over `maxBytes`: drawn to canvas at ≤ `maxDimension`
 *     longest edge, then JPEG-encoded at progressively-lower qualities
 *     until under `maxBytes`. Returns the first result that fits.
 *   - Quality ladder exhausted without fitting under `maxBytes`: returns
 *     the LAST quality's result anyway (degraded > failed).
 *   - Browser can't decode the source (e.g. HEIC on desktop Chrome):
 *     returns the original `File` so the server gets a fair attempt at
 *     it. The server-side type + size guards will reject if needed.
 *
 * EXIF orientation: handled implicitly by the browser's `<img>` decode
 * on iOS Safari (which is where HEIC orientation tags come from). For
 * surfaces where orientation MUST be preserved (e.g. ID verification
 * where the AI cares about the selfie being upright), use the dedicated
 * verification utility in T-029 — NOT this one.
 *
 * @param file  The user-picked image File from a file-input change event.
 * @param options Optional caller overrides for size cap, dimension cap,
 *                quality ladder, or force-reencode.
 * @returns The original `File` (fast-path or fallback) OR a re-encoded
 *          JPEG `Blob`.
 */
export async function compressImageForUpload(
  file: File,
  options: CompressOptions = {},
): Promise<File | Blob> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const qualities = options.qualities ?? DEFAULT_QUALITIES;
  const forceReencode = options.forceReencode ?? false;

  const isHeic = isHeicLike(file);

  // Fast path: already small + web-renderable. Skip canvas roundtrip.
  if (!forceReencode && file.size <= maxBytes && !isHeic) {
    return file;
  }

  // Defence-in-depth: if no qualities supplied, can't re-encode at all.
  // For HEIC inputs this means the original (unrenderable on desktop)
  // is uploaded — log a warn so the misuse is observable.
  if (qualities.length === 0) {
    console.warn(
      "[compress] empty qualities ladder — uploading original (HEIC will be unrenderable on desktop)",
      { name: file.name, isHeic, size: file.size },
    );
    return file;
  }

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const { width, height } = scaleDimensions(
      img.width,
      img.height,
      maxDimension,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    let lastBlob: Blob | null = null;
    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob) {
        lastBlob = blob;
        if (blob.size <= maxBytes) return blob;
      }
    }
    // Quality ladder exhausted — return the last successful blob, OR
    // the original file if every quality step returned null. Either
    // outcome warrants a breadcrumb because the user-facing result is
    // "degraded photo OR over-cap upload that the server may reject"
    // and we want that visible in DevTools / Sentry.
    if (!lastBlob) {
      console.warn(
        "[compress] quality ladder exhausted; no blob produced — uploading original",
        { name: file.name, size: file.size, type: file.type },
      );
    } else if (lastBlob.size > maxBytes) {
      console.warn(
        "[compress] quality ladder exhausted; returning over-cap blob (degraded > failed)",
        {
          name: file.name,
          originalBytes: file.size,
          finalBytes: lastBlob.size,
          cap: maxBytes,
        },
      );
    }
    return lastBlob ?? file;
  } catch (err) {
    // Browser can't decode the source (e.g. HEIC on desktop Chrome) or
    // canvas pipeline failed (CSP block, browser regression, etc).
    // Returning the original lets the server attempt it; the server-
    // side type/size guards will reject with a clear error if the
    // original is unacceptable. Logged at warn so this fall-back path
    // is observable in DevTools + Sentry rather than completely silent.
    console.warn(
      "[compress] canvas pipeline failed — uploading original",
      { name: file.name, size: file.size, type: file.type },
      err,
    );
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Detect HEIC/HEIF by MIME type or filename extension. iOS Safari sets
 *  the MIME correctly; some Android share-sheets only set the extension. */
function isHeicLike(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.heic$|\.heif$/i.test(file.name)
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Browser couldn't decode this image"));
    img.src = src;
  });
}

function scaleDimensions(
  srcW: number,
  srcH: number,
  maxDim: number,
): { width: number; height: number } {
  if (srcW === 0 || srcH === 0) {
    throw new Error("Image has no dimensions");
  }
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  return {
    width: Math.round(srcW * scale),
    height: Math.round(srcH * scale),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}
