"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Maximum target size for the uploaded file. Vercel's default serverless
// function body limit is 4.5 MB; we target 2 MB so the multipart-encoded
// request comfortably fits with overhead. iPhone HEIC + HDR + Live Photo
// captures routinely exceed Vercel's limit, which previously caused the
// request to be silently dropped at the edge before reaching our route.
// (V2.1 launch 2026-05-19 — Bailey reported iPhone Safari library uploads
// failing intermittently while desktop and camera capture worked.)
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Cap the longest edge of the re-encoded image. 2000px covers feed
// rendering at retina densities without being wasteful. Anything larger
// is downscaled before JPEG encode.
const MAX_DIMENSION = 2000;

/**
 * Re-encode and (if needed) downscale a user-picked image so the upload
 * always fits Vercel's body limit. Handles HEIC implicitly on iOS Safari
 * (which natively decodes HEIC into <img>), and produces JPEG output so
 * the resulting URL renders in every browser (HEIC doesn't display in
 * desktop browsers).
 *
 * Falls back to the original file if:
 *   - It's already under the size limit AND in a web-renderable format
 *   - The canvas pipeline fails (browser doesn't support the source format)
 *
 * The route still enforces server-side type + size checks; this is the
 * client-side optimisation that prevents Vercel's edge from dropping
 * the request before it lands.
 */
async function compressImageForUpload(file: File): Promise<File | Blob> {
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.heic$|\.heif$/i.test(file.name);

  // Fast path: already small + web-renderable. Skip canvas roundtrip.
  if (file.size <= MAX_UPLOAD_BYTES && !isHeic) {
    return file;
  }

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Browser couldn't decode this image"));
      i.src = url!;
    });

    let { width, height } = img;
    if (width === 0 || height === 0) {
      throw new Error("Image has no dimensions");
    }
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, width, height);

    // Try progressively lower JPEG quality until we're under the size cap.
    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        return blob;
      }
    }
    // Last-resort low-quality JPEG. Better a degraded photo than a failed upload.
    const finalBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.35),
    );
    if (finalBlob) return finalBlob;
    return file;
  } catch {
    // If the browser can't decode the source (e.g. HEIC on desktop Chrome),
    // fall back to the original file. The server-side size check will reject
    // anything too large with a clear error.
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

interface ImageUploadProps {
  childId: string;
  onUploaded: (url: string | null) => void;
  /**
   * Optional — fires `true` the moment a file is picked, `false` once
   * the network round-trip completes (success or failure). Parents
   * use this to disable their primary submit button so the user
   * can't post the form before the URL is back in state.
   *
   * Add this prop wherever you previously assumed the upload was
   * synchronous. Without it, fast users on slow connections silently
   * submit forms with `image_url: null` while the photo is still
   * mid-flight.
   *
   * Spurious mount-fire is suppressed — only state TRANSITIONS fire
   * the callback. (code-reviewer HIGH on F-001 sub-task 3.)
   */
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
}

export function ImageUpload({
  childId,
  onUploaded,
  onUploadingChange,
  className,
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Surface a user-visible error when the upload fails. Without this,
  // the preview would still show (FileReader dataURL) while the URL
  // is silently null, leading to forms that submit with image_url:
  // null. (silent-failure-hunter HIGH on F-001 sub-task 3.)
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // AbortController makes Remove + unmount cancel an in-flight fetch
  // before it can call `onUploaded` with the CDN URL and overwrite
  // the parent's null. (code-reviewer MEDIUM + silent-failure-hunter
  // HIGH on F-001 sub-task 3.)
  const abortRef = useRef<AbortController | null>(null);
  const isFirstRender = useRef(true);

  // Mirror local state to the optional parent callback. Skip the
  // mount call so a parent that derives logic from the FIRST callback
  // doesn't see a spurious `false` before any user interaction.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  // On unmount, abort any in-flight fetch so it can't resolve into
  // a setState on a torn-down tree (and can't overwrite a parent's
  // image_url state after the parent already moved on).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;

    // Local preview via FileReader — appears instantly so the user
    // sees their photo while the upload runs in the background.
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Abort any prior in-flight upload before starting a new one
    // (rapid file-change before the previous fetch resolves).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setUploading(true);
    try {
      // Compress/convert before upload — iPhone HEIC/HDR/Live photos can
      // exceed Vercel's 4.5 MB body limit and get dropped at the edge
      // before reaching our route. canvas re-encode produces a JPEG ≤2 MB.
      let payload: File | Blob = file;
      try {
        payload = await compressImageForUpload(file);
      } catch (err) {
        console.error("Image compression failed; uploading original:", err);
      }
      if (controller.signal.aborted) return;

      const formData = new FormData();
      // Pin the field name to "file" + give it a deterministic .jpg name so
      // server logs read consistently regardless of source format.
      const filename = payload instanceof File ? payload.name : "upload.jpg";
      formData.append("file", payload, filename);
      formData.append("childId", childId);

      const res = await fetch("/api/upload/development-image", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const result = await res.json().catch(() => ({}));

      if (res.ok && result.url) {
        onUploaded(result.url);
      } else {
        console.error("Image upload error:", res.status, result);
        setPreview(null);
        // Surface specific server messages where helpful so the user
        // knows what to do — generic "Upload failed" hides real causes.
        const friendly = mapUploadError(res.status, result);
        setError(friendly);
        onUploaded(null);
      }
    } catch (err) {
      // AbortError is expected when the user clicks Remove or unmounts
      // mid-upload — don't surface as an error to the user, and don't
      // call onUploaded(null) because the cancel path already set
      // preview/url state correctly.
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      console.error("Image upload failed:", err);
      setPreview(null);
      setError("Upload failed. Check your connection and try again.");
      onUploaded(null);
    } finally {
      // Skip if aborted — the controller state is the canonical signal.
      if (!controller.signal.aborted) {
        setUploading(false);
      }
    }
  }

  /** Surface server-side error reasons to the user. The route returns
   *  structured error codes the user can act on — show them the cause,
   *  not a generic "Upload failed". */
  function mapUploadError(
    status: number,
    body: { error?: string; reason?: string } | undefined,
  ): string {
    if (status === 401) return "Sign in expired — refresh and try again.";
    if (status === 403 && body?.error === "media_consent_required") {
      return "Waiting for the parent to accept the consent for this child before photos can be uploaded.";
    }
    if (status === 400 && body?.error === "Image must be under 10MB") {
      return "Photo is too large. Try a smaller image or one taken at lower resolution.";
    }
    if (status === 400 && body?.error === "File must be an image") {
      return "Only image files are supported.";
    }
    if (status === 413) {
      return "Photo is too large to upload. Try a smaller image.";
    }
    return "Upload failed. Try again or skip the photo.";
  }

  function handleRemove() {
    // Cancel any in-flight upload BEFORE clearing state — otherwise
    // the fetch resolves and overwrites the null we're about to set.
    abortRef.current?.abort();
    setPreview(null);
    setError(null);
    setUploading(false);
    onUploaded(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("relative", className)}>
      {preview ? (
        // Instagram-style 1:1 preview. `aspect-square` + `object-contain`
        // shows the whole image, no cropping. Background is a neutral
        // slate so portrait/landscape letterboxing reads as intentional
        // rather than a layout glitch.
        <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Upload preview"
            className="h-full w-full object-contain"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2
                className="h-6 w-6 animate-spin text-white"
                aria-label="Uploading photo"
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove photo"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white shadow-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500"
        >
          <Camera className="h-4 w-4" />
          Add Photo
        </button>
      )}
      {error && (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
