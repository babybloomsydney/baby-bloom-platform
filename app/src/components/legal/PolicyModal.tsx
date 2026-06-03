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
 * Author-frontmatter prefixes to hide from end users. These are
 * bold-leading lines that authors put at the top of body_md while
 * the document is being drafted — they track slug / version /
 * effective-date / status / author, none of which is meaningful for
 * a parent ticking a consent box. The line filter is permissive:
 * any line whose trimmed start matches one of these prefixes gets
 * dropped. If/when a row's body_md ships with clean legal-finalised
 * copy that doesn't include these markers, the filter naturally
 * no-ops.
 */
const AUTHOR_METADATA_PREFIXES = [
  "**Document slug",
  "**Version",
  "**Effective",
  "**Author",
  "**Status",
] as const;

function stripAuthorFrontmatter(body: string): string {
  return body
    .split("\n")
    .filter((line) => {
      const start = line.trimStart();
      return !AUTHOR_METADATA_PREFIXES.some((prefix) =>
        start.startsWith(prefix),
      );
    })
    .join("\n")
    .replace(/^\s+/, "");
}

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
              {stripAuthorFrontmatter(state.body_md)}
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
