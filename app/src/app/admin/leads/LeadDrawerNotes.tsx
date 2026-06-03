"use client";

// T-032 — Free-form notes textarea with explicit Save button.
//
// Autosave was previously wired here (500ms debounce + on-blur flush) but
// each save triggered a server revalidation, the new props re-ran the
// re-sync useEffect, and that overwrote whatever the user was still
// typing — making the textarea unusable. Bailey reported this from
// production. Switched to explicit Save: local state stays untouched
// while typing, Save commits on demand.

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Save, RotateCcw } from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import { upsertNotes } from "./actions";

interface LeadDrawerNotesProps {
  detail: LeadDetail;
  onLocalPatch: (next: LeadDetail) => void;
}

export function LeadDrawerNotes({
  detail,
  onLocalPatch,
}: LeadDrawerNotesProps) {
  const initial = detail.notes?.body ?? "";
  const [value, setValue] = useState(initial);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastSavedRef = useRef<string>(initial);

  // Re-sync ONLY when the drawer switches to a different nanny — never on
  // body changes that come back from the server, because those re-trigger
  // mid-typing and clobber the user's input.
  useEffect(() => {
    const fresh = detail.notes?.body ?? "";
    setValue(fresh);
    lastSavedRef.current = fresh;
    setJustSaved(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.nanny_user_id]);

  const dirty = value !== lastSavedRef.current;

  const save = () => {
    if (!dirty) return;
    const toSave = value;
    setError(null);
    startTransition(async () => {
      const result = await upsertNotes({
        nanny_user_id: detail.nanny_user_id,
        body: toSave,
      });
      if (result.success) {
        lastSavedRef.current = toSave;
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
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

  const revert = () => {
    setValue(lastSavedRef.current);
    setError(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd+S / Ctrl+S to save — common shortcut when typing a long note.
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  };

  const indicator = isPending ? (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
    </span>
  ) : dirty ? (
    <span className="text-[10px] font-medium text-amber-600">
      Unsaved changes
    </span>
  ) : justSaved ? (
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
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={5}
        maxLength={20_000}
        className="block w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-mono"
        placeholder="Free-form notes. Click Save when done (or Cmd/Ctrl+S)."
      />
      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={revert}
          disabled={!dirty || isPending}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Revert
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save
        </button>
      </div>
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
