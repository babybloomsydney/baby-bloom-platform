"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImageForUpload } from "@/lib/images/compress";
import { mapUploadError } from "@/lib/images/errors";

// Compression + error-mapping live in `@/lib/images/` so every media-
// upload surface can re-use the same logic (T-028). The original inline
// impl (HOTFIX-01, commit 7ba16ac) was extracted in Wave 1 of T-028 —
// behaviour identical; this component now just imports.

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
      // compressImageForUpload is non-throwing by contract — internal
      // errors fall through to returning the original `file` with a
      // console.warn breadcrumb (see lib/images/compress.ts).
      const payload = await compressImageForUpload(file);
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
        const friendly = mapUploadError(res.status, result, "child-feed");
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
