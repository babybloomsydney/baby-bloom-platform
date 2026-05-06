"use client";

/**
 * ParentAvatarEditor — A-05.
 *
 * Click-to-edit wrapper around the parent's hero avatar. Tapping the
 * avatar opens a small dialog with the only action(s) appropriate for
 * the current state:
 *   - "Add image"      — when the parent has no avatar set
 *   - "Replace image"  — when an avatar exists
 *   - "Remove image"   — only when an avatar exists
 *
 * Each upload action triggers a hidden `<input type="file">`, validates
 * type + size client-side, calls the existing `uploadFile` helper to
 * push the file into the `profile-pictures` Supabase Storage bucket,
 * and then persists the resulting public URL via
 * `updateParentProfilePictureUrl` (lib/actions/parent.ts).
 *
 * The editor mirrors the nanny photo-upload constraints from
 * `app/nanny/profile/NannyMyProfile.tsx` (5MB cap, image/* MIME):
 * the parent flow differs only in entry point (avatar tap vs. dedicated
 * profile page) — the upload mechanism is reused.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/supabase/storage";
import { updateParentProfilePictureUrl } from "@/lib/actions/parent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACCEPTED_MIME = "image/jpeg,image/png,image/webp";
const ACCEPTED_MIME_LIST = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — matches the nanny pattern
const STORAGE_BUCKET = "profile-pictures";
const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${STORAGE_BUCKET}/`;

/** Pulls the in-bucket path out of a public Supabase Storage URL.
 *  Returns null when the URL doesn't belong to our bucket — the caller
 *  treats null as "no old object to remove". */
function extractStoragePath(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith(PUBLIC_PATH_PREFIX)) return null;
    return u.pathname.slice(PUBLIC_PATH_PREFIX.length);
  } catch {
    return null;
  }
}

export type ParentAvatarEditorProps = {
  /** Current avatar URL (`user_profiles.profile_picture_url`). Null for
   *  parents who haven't uploaded one yet — falls back to the initial
   *  letter circle. */
  currentUrl: string | null;
  /** First name (used for the initial-letter fallback + alt text). */
  firstName: string;
};

export function ParentAvatarEditor({
  currentUrl,
  firstName,
}: ParentAvatarEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasAvatar = !!currentUrl;
  const initial = (firstName?.[0] ?? "?").toUpperCase();

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    // Client-side validation. The server action also validates the
    // resulting URL prefix; storage RLS gates the upload itself. The
    // explicit MIME allowlist (rather than `image/*` prefix) excludes
    // `image/svg+xml` — SVG is technically an image MIME but executes
    // script when loaded as a document, so we don't accept it here
    // even though the storage layer might let it through.
    if (!ACCEPTED_MIME_LIST.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    setError(null);
    const supabase = createClient();
    let newPath: string | null = null;
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setError("You must be signed in to upload a photo.");
        return;
      }

      const result = await uploadFile(STORAGE_BUCKET, authUser.id, file);
      if (result.error || !result.url) {
        setError(result.error ?? "Upload failed — please try again.");
        return;
      }
      newPath = extractStoragePath(result.url);

      const persist = await updateParentProfilePictureUrl(result.url);
      if (!persist.success) {
        // DB-pointer write failed — the freshly-uploaded file is now
        // an orphan in storage. Best-effort delete so we don't leak
        // unreferenced blobs (security-reviewer HIGH).
        if (newPath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([newPath])
            .catch(() => undefined);
        }
        setError(persist.error ?? "Couldn't save your new photo.");
        return;
      }

      // Replace flow: the old object is no longer referenced. Delete
      // it best-effort so the bucket doesn't accumulate stale blobs
      // every time a parent updates their picture (security-reviewer
      // HIGH on unbounded growth).
      const oldPath = extractStoragePath(currentUrl);
      if (oldPath && oldPath !== newPath) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([oldPath])
          .catch(() => undefined);
      }

      setIsOpen(false);
      // Re-fetch the server-rendered surface so the new avatar appears
      // wherever `user_profiles.profile_picture_url` is read.
      startTransition(() => router.refresh());
    } catch (err) {
      // Reach here only if a Promise threw outside the {success,error}
      // envelopes (e.g. SDK exception, network teardown). Best-effort
      // clean up any uploaded object so the failure is silent in
      // storage too.
      if (newPath) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([newPath])
          .catch(() => undefined);
      }
      console.error("[ParentAvatarEditor] upload error:", err);
      setError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      const result = await updateParentProfilePictureUrl(null);
      if (!result.success) {
        setError(result.error ?? "Couldn't remove your photo.");
        return;
      }
      // Delete the orphaned blob best-effort. RLS scopes the delete to
      // the caller's own folder so this can't touch other users.
      const supabase = createClient();
      const oldPath = extractStoragePath(currentUrl);
      if (oldPath) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([oldPath])
          .catch(() => undefined);
      }
      setIsOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error("[ParentAvatarEditor] remove error:", err);
      setError("Couldn't remove your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const replaceLabel = hasAvatar ? "Replace image" : "Add image";

  return (
    <>
      {/* Avatar surface — clickable. Renders the same visual the parent
          hub used before A-05 (h-24 w-24, white border, violet bg) so the
          hero layout doesn't shift. The button wrapper carries the
          accessible name + focus ring; the inner div is presentational. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={
          hasAvatar
            ? `Edit ${firstName}'s profile picture`
            : `Add a profile picture for ${firstName}`
        }
        className="group relative h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-violet-50 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`${firstName}'s profile picture`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-violet-300">
            {initial}
          </div>
        )}

        {/* Hover/focus camera overlay — communicates the click affordance
            visually (WCAG 1.4.1 — the click target shouldn't rely on a
            tooltip alone). a11y-architect HIGH: bumped scrim from /40
            to /60 so the white camera icon clears WCAG 1.4.11 (3:1
            graphical-contrast) regardless of the underlying photo
            colour. Focus state uses /70 for a stronger differentiator
            from hover so keyboard users can tell which input mode
            triggered the overlay. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:bg-slate-900/70 group-focus-visible:opacity-100"
        >
          <Camera className="h-6 w-6 text-white" />
        </span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {hasAvatar ? "Profile picture" : "Add profile picture"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            // `key={error}` forces a remount when the message text changes
            // so screen readers re-announce the new text even when only
            // the content changed (a11y-architect MED — `role="alert"`
            // on an in-place text swap can be missed by some AT engines).
            <div
              key={error}
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="button"
              onClick={pickFile}
              disabled={uploading}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                replaceLabel
              )}
            </Button>
            {hasAvatar && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemove}
                disabled={uploading}
                className="w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                Remove image
              </Button>
            )}
          </div>

          {/* Hidden file picker — driven by the buttons above. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            onChange={handleFileChange}
            className="hidden"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
