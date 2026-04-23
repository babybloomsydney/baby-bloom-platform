"use client";

/**
 * Input bar pinned above the footer disclaimer.
 *
 * - Auto-growing textarea (up to 4 lines, then scroll)
 * - Enter sends; Shift+Enter newline
 * - Disabled during streaming
 * - Cmd/Ctrl+K focuses from anywhere (global listener)
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, ArrowUp } from "lucide-react";

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

  const canSend = value.trim().length > 0 && !disabled;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    const msg = value.trim();
    setValue("");
    await onSend(msg);
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
      className="flex items-end gap-1.5 border-t border-slate-200 bg-white px-3 py-2"
    >
      <button
        type="button"
        disabled
        aria-label="Attach (coming soon)"
        className="rounded-md p-1.5 text-slate-300"
        tabIndex={-1}
      >
        <Plus className="h-4 w-4" />
      </button>

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
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}
