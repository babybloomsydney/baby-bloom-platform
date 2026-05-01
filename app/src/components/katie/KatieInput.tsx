"use client";

/**
 * Input bar pinned above the footer disclaimer.
 *
 * - Auto-growing textarea (up to 4 lines, then scroll)
 * - Enter sends; Shift+Enter newline
 * - Disabled during streaming
 * - Cmd/Ctrl+K focuses from anywhere (global listener)
 * - Plus button (`KatieActionMenu`) opens a multi-action menu —
 *   image attach + manual log shortcuts. Both surfaces flow through
 *   the draft-tile pattern.
 *
 * Image-attach handoff: when the action menu sets a pending
 * attachment, we render a preview chip above the textarea and embed
 * a `[Image attached: <url>]` marker into the user's next message
 * so Katie has the URL as text context. The attachment clears on
 * send so it doesn't ride along with subsequent messages.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Image as ImageIcon, X } from "lucide-react";
import { KatieActionMenu } from "./KatieActionMenu";
import { useImageAttachment } from "./image-attachment-context";
import { KATIE_IMAGE_MARKER_ENABLED } from "@/lib/chat/flags";

export interface KatieInputProps {
  disabled?: boolean;
  onSend: (message: string) => void | Promise<void>;
  placeholder?: string;
}

export function KatieInput({
  disabled = false,
  onSend,
  placeholder = "Ask Katie…",
}: KatieInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { attachment, clearAttachment, error, setError } = useImageAttachment();

  // Cmd/Ctrl+K global focus
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  const canSend = (value.trim().length > 0 || attachment != null) && !disabled;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const trimmed = value.trim();
    // Marker is gated behind KATIE_IMAGE_MARKER_ENABLED. It's ON by
    // default since WU 9.1 (the system prompt teaches Katie how to
    // route the marker), but the env var stays as a kill-switch.
    const marker =
      attachment && KATIE_IMAGE_MARKER_ENABLED
        ? `[Image attached: ${attachment.url}]`
        : "";
    const msg = [trimmed, marker].filter(Boolean).join("\n\n");
    // Defense-in-depth: if both text and marker collapsed to empty
    // (would happen if marker flag is off AND user sent only an
    // image), substitute a default message so /api/chat doesn't
    // reject with 400. The user uploaded an image — assume they
    // want Katie to act on it.
    const finalMsg =
      msg.length > 0
        ? msg
        : attachment
          ? "I've attached an image — please make a tile from it."
          : "";
    if (finalMsg.length === 0) return;
    setValue("");
    clearAttachment();
    setError(null);
    await onSend(finalMsg);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1.5 border-t border-slate-200 bg-white px-3 py-2"
    >
      {attachment && (
        <div className="flex items-center gap-2 rounded-md bg-slate-50 p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.previewUrl}
            alt="Attached image preview"
            className="h-12 w-12 rounded object-cover"
          />
          <div className="flex-1 text-xs font-medium text-slate-600">
            <ImageIcon className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Image attached
          </div>
          <button
            type="button"
            onClick={clearAttachment}
            aria-label="Remove attached image"
            // p-1.5 + 14px icon = ≈26px target — clears WCAG 2.5.8 24×24.
            className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <KatieActionMenu disabled={disabled} />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Katie is writing…" : placeholder}
          rows={1}
          aria-label="Message Katie"
          className="flex-1 resize-none rounded-md border-0 bg-slate-100 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors " +
            (canSend
              ? "bg-violet-600 text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              : "bg-slate-200 text-slate-400")
          }
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
