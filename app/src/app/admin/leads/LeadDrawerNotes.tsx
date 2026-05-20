"use client";

// T-032 — Free-form notes textarea, auto-save on blur (500ms debounce).

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import { upsertNotes } from "./actions";

interface LeadDrawerNotesProps {
  detail: LeadDetail;
  onLocalPatch: (next: LeadDetail) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export function LeadDrawerNotes({
  detail,
  onLocalPatch,
}: LeadDrawerNotesProps) {
  const initial = detail.notes?.body ?? "";
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(initial);

  // Re-sync when the parent detail changes (e.g. drawer re-opened on a different nanny).
  useEffect(() => {
    setValue(detail.notes?.body ?? "");
    lastSavedRef.current = detail.notes?.body ?? "";
  }, [detail.nanny_user_id, detail.notes?.body]);

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value === lastSavedRef.current) return;
    const toSave = value;
    setError(null);
    startTransition(async () => {
      const result = await upsertNotes({
        nanny_user_id: detail.nanny_user_id,
        body: toSave,
      });
      if (result.success) {
        lastSavedRef.current = toSave;
        setSavedAt(Date.now());
        onLocalPatch({
          ...detail,
          notes: {
            id: detail.notes?.id ?? "",
            nanny_user_id: detail.nanny_user_id,
            body: toSave,
            last_edited_by: detail.notes?.last_edited_by ?? "",
            created_at: detail.notes?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        setError(result.error);
      }
    });
  };

  const onBlur = () => {
    flush();
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const indicator = isPending ? (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
    </span>
  ) : savedAt ? (
    <span className="flex items-center gap-1 text-[10px] text-green-600">
      <Check className="h-3 w-3" /> Saved
    </span>
  ) : null;

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
        </h3>
        {indicator}
      </div>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={5}
        maxLength={20_000}
        className="block w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-mono"
        placeholder="Free-form notes. Auto-saves on blur."
      />
      {error && (
        <p
          role="alert"
          className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </section>
  );
}
