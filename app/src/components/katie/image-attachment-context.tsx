"use client";

/**
 * Shared client-side state for an image the user has attached via
 * the Plus action menu. The attachment is held here (not inside
 * `KatieInput`) because two surfaces need to read/write it:
 *
 *   - `KatieActionMenu`    — uploads + sets the attachment
 *   - `KatieInput`         — shows preview + a remove button, and
 *                            embeds the URL into the next user message
 *                            on send (and clears the attachment)
 *   - draft tile renderer  — when a draft tile arrives and an
 *                            attachment is already in flight, the
 *                            renderer auto-uses it instead of asking
 *
 * The context is mounted by `KatieDeck` so all three children share
 * one source of truth. Outside the deck (e.g., on routes without
 * Katie) the context isn't required, so the optional accessor falls
 * back to no-op handlers.
 *
 * Blob URL lifecycle: every preview URL goes through `revokedRef` —
 * the only piece of state that knows what URL is currently live.
 * Replace and clear both run through `revokeIfDifferent`, which is
 * the single revoke gate. The unmount cleanup uses the same gate.
 * No double-revoke is possible because `revokedRef.current` clears
 * itself the moment the URL is revoked.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ImageAttachment {
  /** Public URL returned by /api/chat/upload */
  url: string;
  /** Local blob URL for instant preview — revoked when cleared. */
  previewUrl: string;
}

interface ImageAttachmentContextValue {
  attachment: ImageAttachment | null;
  setAttachment: (next: ImageAttachment | null) => void;
  /** Used by the preview chip to clear without triggering revoke twice. */
  clearAttachment: () => void;
  /**
   * Atomic read-and-clear. Returns whatever attachment is currently
   * live and immediately clears it. Used by the draft-tile auto-
   * adopt path so concurrent drafts can't both adopt the same
   * attachment (the second caller gets `null`).
   */
  takeAttachment: () => ImageAttachment | null;
  error: string | null;
  setError: (next: string | null) => void;
}

const noop = () => {};

const FALLBACK: ImageAttachmentContextValue = {
  attachment: null,
  setAttachment: noop,
  clearAttachment: noop,
  takeAttachment: () => null,
  error: null,
  setError: noop,
};

const ImageAttachmentContext =
  createContext<ImageAttachmentContextValue>(FALLBACK);

export function ImageAttachmentProvider({ children }: { children: ReactNode }) {
  const [attachment, setAttachmentState] = useState<ImageAttachment | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // The currently-live blob URL. Mirrors the `previewUrl` of the
  // attachment in state. Used as the single source of truth for the
  // revoke gate so React's render lifecycle and the unmount effect
  // can't double-revoke an already-released URL.
  const livePreviewRef = useRef<string | null>(null);

  const revokeIfLive = useCallback((url: string | null) => {
    if (!url) return;
    if (livePreviewRef.current === url) {
      URL.revokeObjectURL(url);
      livePreviewRef.current = null;
    }
  }, []);

  // Mirror of the live attachment kept in a ref so consumers can
  // perform atomic read-and-clear. React state alone can't deliver
  // that — `attachment` from useState is the value at last render,
  // not "what's live right now".
  const liveAttachmentRef = useRef<ImageAttachment | null>(null);

  const setAttachment = useCallback(
    (next: ImageAttachment | null) => {
      // Revoke whatever's currently live (if anything) before adopting
      // the new value. Synchronous — happens regardless of whether the
      // setState commits later.
      const prevLive = livePreviewRef.current;
      if (prevLive && prevLive !== next?.previewUrl) {
        revokeIfLive(prevLive);
      }
      livePreviewRef.current = next?.previewUrl ?? null;
      liveAttachmentRef.current = next;
      setAttachmentState(next);
    },
    [revokeIfLive],
  );

  const clearAttachment = useCallback(() => {
    setAttachment(null);
  }, [setAttachment]);

  const takeAttachment = useCallback((): ImageAttachment | null => {
    // Read the ref (not the state) so a second caller in the same
    // render tick — or a sibling in a concurrent useEffect — sees
    // the cleared value as soon as the first caller takes it.
    const taken = liveAttachmentRef.current;
    if (!taken) return null;
    // Use the live preview URL as the gate so revokeIfLive's idempotency
    // protects against any double-revoke that might happen if both the
    // taker AND a later setAttachment try to free the same URL.
    setAttachment(null);
    return taken;
  }, [setAttachment]);

  // Final cleanup if the provider unmounts with an attachment still
  // in flight (e.g., navigation away from Katie surface). The
  // `revokeIfLive` gate makes this idempotent if the user already
  // cleared via `setAttachment`.
  useEffect(() => {
    return () => {
      revokeIfLive(livePreviewRef.current);
    };
  }, [revokeIfLive]);

  const value = useMemo(
    () => ({
      attachment,
      setAttachment,
      clearAttachment,
      takeAttachment,
      error,
      setError,
    }),
    [attachment, setAttachment, clearAttachment, takeAttachment, error],
  );

  return (
    <ImageAttachmentContext.Provider value={value}>
      {children}
    </ImageAttachmentContext.Provider>
  );
}

export function useImageAttachment(): ImageAttachmentContextValue {
  return useContext(ImageAttachmentContext);
}
