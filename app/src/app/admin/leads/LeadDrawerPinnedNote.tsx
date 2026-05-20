"use client";

// T-032 — Single-slot pinned note. Stays visible above the contact log.

import { useState, useTransition } from "react";
import { Pin, X } from "lucide-react";
import type { LeadDetail } from "@/lib/leads/fetch-lead-detail";
import { Button } from "@/components/ui/button";
import { pinNote } from "./actions";

interface LeadDrawerPinnedNoteProps {
  detail: LeadDetail;
  onLocalPatch: (next: LeadDetail) => void;
}

export function LeadDrawerPinnedNote({
  detail,
  onLocalPatch,
}: LeadDrawerPinnedNoteProps) {
  const current = detail.contact_state?.pinned_note ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [isPending, startTransition] = useTransition();

  const save = (newValue: string | null) => {
    startTransition(async () => {
      const result = await pinNote({
        nanny_user_id: detail.nanny_user_id,
        pinned_note: newValue,
      });
      if (result.success) {
        onLocalPatch({
          ...detail,
          contact_state: detail.contact_state
            ? { ...detail.contact_state, pinned_note: newValue }
            : null,
        });
        setEditing(false);
      }
    });
  };

  if (!current && !editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setValue("");
        }}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        <Pin className="h-3.5 w-3.5" />
        <span>Pin a key insight to keep visible</span>
      </button>
    );
  }

  return (
    <section className="rounded-md border-2 border-violet-200 bg-violet-50/50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
          <Pin className="h-3 w-3" />
          Pinned note
        </div>
        {!editing && current && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setEditing(true);
                setValue(current);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => save(null)}
              aria-label="Remove pinned note"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            maxLength={500}
            className="block w-full resize-y rounded border border-violet-200 bg-white px-2 py-1.5 text-sm"
            placeholder="One short insight…"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending || value.trim().length === 0}
              onClick={() => save(value.trim())}
            >
              Pin
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-900">{current}</p>
      )}
    </section>
  );
}
