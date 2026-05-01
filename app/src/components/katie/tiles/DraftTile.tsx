"use client";

/**
 * DraftTile — Katie's "sudo tile" pattern. Wraps a preview tile
 * (diary / observation / progress / activity / katie_note) with an
 * action footer:
 *
 *   - Add Image / Remove Image — manage the optional image_url
 *     that the eventual apply call will persist. If the user has
 *     already attached an image via the Plus action menu, this
 *     tile auto-uses it on first render and skips the Add Image
 *     prompt; the chip up at the input clears as soon as the draft
 *     adopts it.
 *   - Accept   — commits the draft via the draft-actions context.
 *   - Amend    — tells Katie to ask "what would you like to change?".
 *   - Dismiss  — removes the host chat message; nothing persists.
 *
 * Local state vs server state: the imageUrl + the args mutate
 * locally inside this component (because Add/Remove Image is a
 * client interaction). They flush to the server ONLY on Accept.
 * Until then, nothing is in bapp_logs / chat_messages beyond the
 * draft tile itself.
 */

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Check,
  Pencil,
} from "lucide-react";
import type { DraftablePreview, DraftChatTile } from "@/lib/chat/tiles";
import type { FeedItem } from "@/types/bapp";
import { KatieNoteTile } from "./KatieNoteTile";
import { ActivityTile } from "@/components/bapp/tiles/ActivityTile";
import { ObservationTile } from "@/components/bapp/tiles/ObservationTile";
import { DiaryTile } from "@/components/bapp/tiles/DiaryTile";
import { ProgressTile } from "@/components/bapp/tiles/ProgressTile";
import { useDraftActions } from "./draft-actions-context";
import { useImageAttachment } from "../image-attachment-context";

const ACCEPTED_TYPES_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
const ACCEPTED_TYPES_ATTR = ACCEPTED_TYPES_LIST.join(",");
const ACCEPTED_TYPES_SET: ReadonlySet<string> = new Set(ACCEPTED_TYPES_LIST);
const MAX_BYTES = 10 * 1024 * 1024;

interface DraftTileProps {
  tile: DraftChatTile;
}

export function DraftTile({ tile }: DraftTileProps) {
  const { draftId, toolName, args, preview } = tile.data;
  const actions = useDraftActions();
  const { takeAttachment } = useImageAttachment();

  // Image URL the eventual apply call will use. Seeded from any
  // pre-existing image_url on the preview args; auto-adopts a
  // pending Plus-button attachment on first render via the atomic
  // takeAttachment so concurrent drafts can't both adopt the same
  // image; can be set or cleared via this tile's own buttons.
  const initialImageUrl = (() => {
    const argImg = (args as { image_url?: unknown }).image_url;
    return typeof argImg === "string" && argImg.length > 0 ? argImg : null;
  })();
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState<
    "accept" | "amend" | "dismiss" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const adoptedRef = useRef(false);
  // Captures the Amend button so focus can return there when the user
  // exits amend mode (Cancel / Esc / Submit). Without this restoration
  // we'd fail SC 2.4.3 Focus Order — focus would drop to <body> when
  // the textarea unmounts and AT users would lose their place in the
  // tile's action row.
  const amendTriggerRef = useRef<HTMLButtonElement | null>(null);

  // First-render adopt: if the user attached an image via the Plus
  // menu before this draft arrived, take it (atomic read-and-clear)
  // and use it as the draft's image. The input chip clears as a
  // side-effect of `takeAttachment`. Concurrent drafts each call
  // takeAttachment; the second one gets `null` and shows the Add
  // Image button.
  useEffect(() => {
    if (adoptedRef.current) return;
    adoptedRef.current = true;
    if (initialImageUrl) {
      // Args already had an image_url — nothing to adopt.
      return;
    }
    const taken = takeAttachment();
    if (taken) {
      setImageUrl(taken.url);
    }
    // Mount-only — we don't want to re-adopt later when the
    // attachment context changes for some other reason. The
    // adoptedRef + reset-on-mount-only protects against React
    // strict mode double-invocation as well.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAddImageClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setUploadError(
        `Image is too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`,
      );
      return;
    }
    if (!ACCEPTED_TYPES_SET.has(file.type)) {
      setUploadError("Try a JPEG, PNG, WebP, GIF, or HEIC.");
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setUploadError(body.error ?? "Upload failed.");
        return;
      }
      setImageUrl(body.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage() {
    setImageUrl(null);
    setUploadError(null);
  }

  // Amend mode: when true, the action row collapses and an inline
  // textarea appears for the user to describe their change directly
  // on the tile. Submit fires onAmend with the user's text; cancel
  // returns to the action row without sending anything.
  const [amending, setAmending] = useState(false);
  const [amendText, setAmendText] = useState("");

  async function handleAccept() {
    if (submitting) return;
    setSubmitting("accept");
    try {
      await actions.onAccept(draftId, toolName, args, imageUrl);
    } finally {
      setSubmitting(null);
    }
  }

  function handleAmendStart() {
    if (submitting) return;
    setAmending(true);
  }

  function handleAmendCancel() {
    setAmending(false);
    setAmendText("");
    // Restore focus to the trigger so keyboard / AT users land back
    // on the Amend button rather than <body>. Defer to next tick so
    // the textarea unmount completes before we focus.
    queueMicrotask(() => amendTriggerRef.current?.focus());
  }

  async function handleAmendSubmit() {
    if (submitting) return;
    const textToSend = amendText.trim();
    setSubmitting("amend");
    try {
      await actions.onAmend(draftId, toolName, textToSend);
      // Success: collapse amend mode and return focus to the Amend
      // trigger. We only clear amendText here so a thrown error
      // preserves the user's typing for retry without re-typing.
      setAmending(false);
      setAmendText("");
    } finally {
      setSubmitting(null);
      queueMicrotask(() => amendTriggerRef.current?.focus());
    }
  }

  function handleDismiss() {
    if (submitting) return;
    setSubmitting("dismiss");
    actions.onDismiss(draftId);
  }

  // The preview tile may already display an image via its own
  // image_url field on the inner snapshot. If we've added one via
  // this footer, merge it into the rendered preview so the user
  // sees what the persisted tile will look like.
  const previewWithImage = imageUrl
    ? mergeImageIntoPreview(preview, imageUrl)
    : preview;

  // The Accept/Amend/Dismiss row works only when the surrounding
  // KatieDeck mounts the DraftActionsProvider. When that's missing
  // (rare — only inside isolated test renders or stripped surfaces)
  // we wire `aria-disabled` + `aria-describedby` so screen-reader
  // users hear the reason rather than just hitting an inert button.
  const notWiredId = `draft-not-wired-${draftId}`;

  return (
    <div
      role="group"
      aria-label="Draft tile — Accept, Amend, or Dismiss"
      aria-busy={!!submitting || uploading}
      className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 shadow-sm"
    >
      {/* Visually-hidden live region for AT users — announces async
          state transitions that visual users see as a spinner, plus
          the amend-mode toggle which is a meaningful UI shift even
          when nothing is "submitting". */}
      <span className="sr-only" aria-live="polite">
        {submitting === "accept" && "Accepting draft"}
        {submitting === "amend" && "Asking Katie for amendments"}
        {submitting === "dismiss" && "Dismissing draft"}
        {uploading && "Uploading image"}
        {amending && !submitting && "Amend mode — describe your change"}
      </span>

      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        Draft — review and confirm
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES_ATTR}
        onChange={handleFileChosen}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="rounded-lg bg-white">
        <RenderPreview preview={previewWithImage} />
      </div>

      {uploadError && (
        <div
          role="alert"
          className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700"
        >
          {uploadError}
        </div>
      )}

      {/* Image affordance — suppressed on tile kinds where an image
          isn't a meaningful part of the entry. Activity plans are
          AI-generated reading material, not user-captured moments,
          so an Add Image button on those drafts confuses the user.
          Add other suppressions here if more kinds turn out the same.
      */}
      {preview.kind !== "activity" && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {imageUrl ? (
            <button
              type="button"
              onClick={handleRemoveImage}
              disabled={!!submitting || uploading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Remove image
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddImageClick}
              disabled={!!submitting || uploading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <ImageIcon className="h-3 w-3" aria-hidden="true" />
              )}
              {uploading ? "Uploading…" : "Add image"}
            </button>
          )}
        </div>
      )}

      {amending ? (
        <div className="mt-2 space-y-1.5">
          <label
            htmlFor={`amend-text-${draftId}`}
            className="block text-[11px] font-medium text-violet-700"
          >
            What would you like to change?
          </label>
          <textarea
            id={`amend-text-${draftId}`}
            value={amendText}
            onChange={(e) => setAmendText(e.target.value)}
            placeholder="e.g. change the meal to lunch, add 'half a banana'…"
            disabled={!!submitting}
            rows={2}
            className="w-full resize-none rounded-md border border-violet-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
            autoFocus
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter submits; Esc cancels. Plain Enter
              // makes a newline so longer change requests don't
              // submit prematurely.
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                amendText.trim().length > 0
              ) {
                e.preventDefault();
                void handleAmendSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleAmendCancel();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleAmendSubmit}
              disabled={!!submitting || amendText.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting === "amend" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3 w-3" aria-hidden="true" />
              )}
              Submit change
            </button>
            <button
              type="button"
              onClick={handleAmendCancel}
              disabled={!!submitting}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <span className="ml-1 text-[10px] italic text-slate-600">
              Cmd/Ctrl+Enter to submit, Esc to cancel
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={actions.isWired ? handleAccept : undefined}
            aria-disabled={!!submitting || uploading || !actions.isWired}
            aria-describedby={!actions.isWired ? notWiredId : undefined}
            disabled={!!submitting || uploading}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {submitting === "accept" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3 w-3" aria-hidden="true" />
            )}
            Accept
          </button>
          <button
            ref={amendTriggerRef}
            type="button"
            onClick={actions.isWired ? handleAmendStart : undefined}
            aria-disabled={!!submitting || uploading || !actions.isWired}
            aria-describedby={!actions.isWired ? notWiredId : undefined}
            disabled={!!submitting || uploading}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Amend
          </button>
          <button
            type="button"
            onClick={actions.isWired ? handleDismiss : undefined}
            aria-disabled={!!submitting || uploading || !actions.isWired}
            aria-describedby={!actions.isWired ? notWiredId : undefined}
            disabled={!!submitting || uploading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            <Plus className="h-3 w-3 rotate-45" aria-hidden="true" />
            Dismiss
          </button>
        </div>
      )}

      {!actions.isWired && (
        <p id={notWiredId} className="mt-2 text-[10px] italic text-slate-400">
          Draft actions not wired in this surface.
        </p>
      )}
    </div>
  );
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * Render the inner preview tile by kind. We don't go through
 * `RenderTile` here because that would route through the registry
 * which itself dispatches to `<DraftTile />` for `kind: "draft"` —
 * a draft cannot contain another draft, so we narrow to the
 * draftable kinds only.
 */
function RenderPreview({ preview }: { preview: DraftablePreview }) {
  switch (preview.kind) {
    case "katie_note":
      return <KatieNoteTile tile={preview} />;
    case "activity":
      return <ActivityTile item={preview.data.item as FeedItem} />;
    case "observation":
      return <ObservationTile item={preview.data.item as FeedItem} />;
    case "diary":
      return <DiaryTile item={preview.data.item as FeedItem} />;
    case "progress":
      return <ProgressTile item={preview.data.item as FeedItem} />;
    default: {
      const _exhaustive: never = preview;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Returns a copy of the preview tile with the given image_url
 * threaded into whichever field that kind exposes for images.
 *
 * - katie_note: `data.image_url` directly on the tile data
 * - activity / observation / diary / progress: `data.item.data.image_url`
 *   on the inner FeedItem snapshot
 *
 * Each feed-item branch narrows `preview` first, then clones the
 * inner item *within that branch*. Constructing the cloned item
 * inside the narrowed scope means TypeScript keeps the literal
 * `type` field on the discriminant instead of widening to `string`.
 * This pattern avoids the post-hoc intersection casts we'd need
 * if the clone were built before the switch.
 */
function mergeImageIntoPreview(
  preview: DraftablePreview,
  imageUrl: string,
): DraftablePreview {
  switch (preview.kind) {
    case "katie_note":
      return {
        ...preview,
        data: { ...preview.data, image_url: imageUrl },
      };
    case "activity":
      return {
        kind: "activity",
        data: {
          item: {
            ...preview.data.item,
            data: { ...preview.data.item.data, image_url: imageUrl },
          },
        },
      };
    case "observation":
      return {
        kind: "observation",
        data: {
          item: {
            ...preview.data.item,
            data: { ...preview.data.item.data, image_url: imageUrl },
          },
        },
      };
    case "diary":
      return {
        kind: "diary",
        data: {
          item: {
            ...preview.data.item,
            data: { ...preview.data.item.data, image_url: imageUrl },
          },
        },
      };
    case "progress":
      return {
        kind: "progress",
        data: {
          item: {
            ...preview.data.item,
            data: { ...preview.data.item.data, image_url: imageUrl },
          },
        },
      };
    default: {
      const _exhaustive: never = preview;
      void _exhaustive;
      return preview;
    }
  }
}
