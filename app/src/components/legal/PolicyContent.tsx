"use client";

import { useEffect, useState } from "react";
import {
  getPolicyMarkdown,
  type LegalPolicyDocument,
} from "@/lib/actions/legal/get-policy";

/**
 * Renders a legal document body from `legal_documents.body_md`.
 *
 * Slug-keyed: pass `slug="parent-app-consent"` (or `"nanny-attestation"`
 * etc.) and the component renders the highest-version body for that slug.
 *
 * **Client-rendered** — fetches via the `getPolicyMarkdown` server action
 * on mount. This component MUST stay client-side because every call site
 * (`AddChildSheet`, `AddChildSheetParent`, `ConsentRenewalModal`,
 * `InviteLandingClient`) is itself a `'use client'` component. Previously
 * this was an `async` Server Component that called `createAdminClient`
 * directly — Next.js bundled the function body (including
 * `createAdminClient`) into the client chunks, which threw "Missing
 * Supabase admin credentials" at render and produced the V2.1 white
 * screen on the parent add-child flow.
 *
 * If the row exists but `body_md` is NULL (T-014 hasn't filled the body
 * yet), shows a placeholder block clearly marked as such so QA can spot
 * un-finalised text.
 */
export function PolicyContent({ slug }: { slug: string }) {
  // `undefined` = loading. `null` = lookup failed / slug unknown. Object
  // when present — `body_md` may still be NULL inside (pending text).
  const [state, setState] = useState<LegalPolicyDocument | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    setState(undefined);
    getPolicyMarkdown(slug)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch((err) => {
        console.error("[PolicyContent] failed for slug=" + slug + ":", err);
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === undefined) {
    return (
      <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Policy text unavailable.</strong> Slug{" "}
        <code className="font-mono">{slug}</code> not found in{" "}
        <code className="font-mono">legal_documents</code>. Confirm the T-015
        seed migration has been applied + that T-014 has populated the row.
      </div>
    );
  }

  if (!state.body_md) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Policy text pending.</strong> Document{" "}
        <code className="font-mono">{slug}</code> (v{state.version}) exists but
        has no body yet. Policies090526 (T-014) needs to populate{" "}
        <code className="font-mono">body_md</code>.
      </div>
    );
  }

  // body_md is markdown but for v1 we render as preformatted text
  // (no client-side markdown parser dependency added). T-014's text is
  // expected to be short clickwrap copy that renders fine this way.
  // Future: pipe through a markdown renderer when bodies grow longer.
  return (
    <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <pre className="whitespace-pre-wrap break-words font-sans">
        {state.body_md}
      </pre>
    </div>
  );
}
