"use client";

/**
 * ChildAvatarEditor — A-06.
 *
 * Click-to-edit wrapper around the child's hero avatar in BAppLayout.
 * Mirrors `ParentAvatarEditor` (A-05) — same dialog shape, same
 * upload mechanism, same orphan-cleanup pattern. Differences vs the
 * parent editor:
 *
 *   - Either the linked parent OR the linked nanny can edit. The
 *     server action (`updateChildProfilePictureUrl`) verifies the
 *     caller is one of those two users.
 *   - Sized for the smaller hero avatar (h-20 w-20, emerald palette
 *     to match the BB-app feed's existing visual language).
 *   - Persists `child_client.profile_picture_url` instead of
 *     `user_profiles.profile_picture_url`.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Baby, Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/supabase/storage";
import { updateChildProfilePictureUrl } from "@/lib/actions/bapp/child-clients";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACCEPTED_MIME = "image/jpeg,image/png,image/webp";
const ACCEPTED_MIME_LIST = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const STORAGE_BUCKET = "profile-pictures";
const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${STORAGE_BUCKET}/`;

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

export type ChildAvatarEditorProps = {
  childId: string;
  /** Current avatar URL (`child_client.profile_picture_url`). */
  currentUrl: string | null;
  /** Child's first name — used for the initial-letter fallback + alt
   *  text + personalised aria-label. */
  childFirstName: string | null;
};

export function ChildAvatarEditor({
  childId,
  currentUrl,
  childFirstName,
}: ChildAvatarEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasAvatar = !!currentUrl;
  const displayName = childFirstName ?? "Child";
  // Disambiguator for the aria-label when childFirstName is null and
  // multiple children might render side-by-side (a11y-architect MED:
  // SC 2.4.6 — accessible names should be unique). Using the last 4
  // chars of the child id keeps the announcement short while still
  // distinguishing siblings without exposing the full uuid.
  const ariaSuffix = childFirstName === null ? ` (${childId.slice(-4)})` : "";

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

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

      const persist = await updateChildProfilePictureUrl(childId, result.url);
      if (!persist.success) {
        if (newPath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([newPath])
            .catch(() => undefined);
        }
        setError(persist.error ?? "Couldn't save the new photo.");
        return;
      }

      // Replace flow — only delete the old object if it was uploaded by
      // THIS user (i.e. it lives in the caller's own folder). The other
      // role's earlier upload may still live in their folder; storage
      // RLS would reject the cross-user remove anyway.
      const oldPath = extractStoragePath(currentUrl);
      if (
        oldPath &&
        oldPath !== newPath &&
        oldPath.startsWith(`${authUser.id}/`)
      ) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([oldPath])
          .catch(() => undefined);
      }

      setIsOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      if (newPath) {
        await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([newPath])
          .catch(() => undefined);
      }
      console.error("[ChildAvatarEditor] upload error:", err);
      setError("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      const result = await updateChildProfilePictureUrl(childId, null);
      if (!result.success) {
        setError(result.error ?? "Couldn't remove the photo.");
        return;
      }

      // DB pointer is cleared — the logical operation is done. Close
      // the dialog + refresh the page BEFORE attempting blob cleanup
      // so a transient cleanup failure can't paint a misleading error
      // over what the user just successfully did (code-reviewer HIGH).
      setIsOpen(false);
      startTransition(() => router.refresh());

      // Best-effort delete the prior blob, fire-and-forget. RLS would
      // reject a cross-user remove, so we only attempt when the path
      // is in the caller's own folder.
      const oldPathSnapshot = extractStoragePath(currentUrl);
      if (oldPathSnapshot) {
        void (async () => {
          try {
            const supabase = createClient();
            const {
              data: { user: authUser },
            } = await supabase.auth.getUser();
            if (authUser && oldPathSnapshot.startsWith(`${authUser.id}/`)) {
              await supabase.storage
                .from(STORAGE_BUCKET)
                .remove([oldPathSnapshot])
                .catch(() => undefined);
            }
          } catch {
            // Cleanup is best-effort; storage lifecycle / future cron
            // can reap orphans. Don't surface to the user.
          }
        })();
      }
    } catch (err) {
      console.error("[ChildAvatarEditor] remove error:", err);
      setError("Couldn't remove the photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const replaceLabel = hasAvatar ? "Replace image" : "Add image";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={
          hasAvatar
            ? `Edit ${displayName}'s profile picture${ariaSuffix}`
            : `Add a profile picture for ${displayName}${ariaSuffix}`
        }
        className="group relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-emerald-50 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`${displayName}'s profile picture`}
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        ) : (
          // Default fallback: Baby lucide icon, not the child's initial.
          // The initial fallback was replaced per user feedback
          // (2026-05-07) — the baby silhouette reads as a clear
          // "no photo yet" affordance rather than a personalised
          // monogram which can feel like an intentional design choice.
          <div className="flex h-full w-full items-center justify-center text-emerald-500">
            <Baby aria-hidden="true" className="h-8 w-8" />
          </div>
        )}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:bg-slate-900/70 group-focus-visible:opacity-100"
        >
          <Camera className="h-5 w-5 text-white" />
        </span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {hasAvatar
                ? `${displayName}'s profile picture`
                : `Add ${displayName}'s profile picture`}
            </DialogTitle>
          </DialogHeader>

          {error && (
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
              className="w-full bg-emerald-600 hover:bg-emerald-700"
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
