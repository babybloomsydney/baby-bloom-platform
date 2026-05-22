"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPolicyMarkdown,
  type LegalPolicyDocument,
} from "@/lib/actions/legal/get-policy";

/**
 * Modal that renders a legal document's `body_md` as plaintext when
 * the user taps a "terms of use" hyperlink.
 *
 * - Body fetched lazily on first open via `getPolicyMarkdown` server
 *   action (keeps `createAdminClient` server-side).
 * - Dialog primitive (Radix UI) — click anywhere on the dim overlay
 *   to close. Scrolling inside the content does NOT close.
 * - Small, plain typography by design (mundane, no marketing copy).
 */
interface PolicyModalProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional title for the modal header. Defaults to "Terms". */
  title?: string;
}

export function PolicyModal({
  slug,
  open,
  onOpenChange,
  title = "Terms",
}: PolicyModalProps) {
  const [state, setState] = useState<LegalPolicyDocument | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState(undefined);
    getPolicyMarkdown(slug)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((err) => {
        console.error("[PolicyModal] failed for slug=" + slug + ":", err);
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-slate-700">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto text-xs leading-relaxed text-slate-600">
          {state === undefined && <p className="text-slate-400">Loading…</p>}
          {state === null && (
            <p className="text-slate-500">
              Policy text unavailable. Please try again later.
            </p>
          )}
          {state && state.body_md && (
            <pre className="whitespace-pre-wrap break-words font-sans">
              {state.body_md}
            </pre>
          )}
          {state && !state.body_md && (
            <p className="text-slate-500">Policy text is being finalised.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
