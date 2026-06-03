"use client";

// T-032 — Quick "Add log" popup launched from the list row's Log button.
// Slimmed-down log-contact form (no purpose / next-action complexity) —
// for full-fidelity logging the operator opens the drawer.

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CONTACT_DIRECTIONS,
  CONTACT_METHODS,
  type ContactDirection,
  type ContactMethod,
  type ContactOutcome,
} from "@/lib/leads/types";
import { logContact } from "./actions";

interface LeadQuickLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nannyUserId: string;
  nannyName: string;
  onSaved?: () => void;
}

const OUTCOME_CHIPS: { value: ContactOutcome; label: string; tone: string }[] =
  [
    {
      value: "answered",
      label: "Answered",
      tone: "bg-green-50 text-green-700 ring-green-200",
    },
    {
      value: "voicemail",
      label: "Voicemail",
      tone: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    {
      value: "no_answer",
      label: "No answer",
      tone: "bg-slate-50 text-slate-600 ring-slate-200",
    },
    {
      value: "replied",
      label: "Replied",
      tone: "bg-teal-50 text-teal-700 ring-teal-200",
    },
    {
      value: "booked",
      label: "Booked",
      tone: "bg-violet-50 text-violet-700 ring-violet-200",
    },
    {
      value: "not_interested",
      label: "Not interested",
      tone: "bg-red-50 text-red-700 ring-red-200",
    },
  ];

export function LeadQuickLogModal({
  open,
  onOpenChange,
  nannyUserId,
  nannyName,
  onSaved,
}: LeadQuickLogModalProps) {
  const [method, setMethod] = useState<ContactMethod>("call");
  const [direction, setDirection] = useState<ContactDirection>("outbound");
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setMethod("call");
    setDirection("outbound");
    setOutcome(null);
    setNote("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await logContact({
        nanny_user_id: nannyUserId,
        method,
        direction,
        outcome,
        note: note.trim() || null,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      reset();
      onSaved?.();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log contact</DialogTitle>
          <DialogDescription>{nannyName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Method + direction */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as ContactMethod)}
                disabled={isPending}
                className="h-8 w-full rounded border border-slate-200 px-2 text-sm"
              >
                {CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Direction</span>
              <select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as ContactDirection)
                }
                disabled={isPending}
                className="h-8 w-full rounded border border-slate-200 px-2 text-sm"
              >
                {CONTACT_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Outcome chips */}
          <div>
            <span className="mb-1 block text-xs text-slate-500">Outcome</span>
            <div className="flex flex-wrap items-center gap-1">
              {OUTCOME_CHIPS.map((c) => {
                const active = outcome === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setOutcome(active ? null : c.value)}
                    disabled={isPending}
                    aria-pressed={active}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${c.tone} ${
                      active ? "ring-2" : ""
                    } ${isPending ? "opacity-50" : ""}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isPending}
              rows={3}
              maxLength={2000}
              className="block w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="One line is fine."
            />
          </label>

          {error && (
            <p
              role="alert"
              className="rounded bg-red-50 px-2 py-1 text-xs text-red-700"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={isPending} onClick={submit}>
            {isPending ? "Logging…" : "Log contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
