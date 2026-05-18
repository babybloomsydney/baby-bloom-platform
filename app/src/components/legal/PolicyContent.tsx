import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Renders a legal document body from `legal_documents.body_md`.
 *
 * Slug-keyed: pass `slug="parent-app-consent"` (or `"nanny-attestation"`
 * etc.) and the component renders the highest-version body for that slug.
 *
 * **Server-rendered** — no client JS. Drops into any form layout. If
 * the row exists but `body_md` is NULL (T-014 hasn't filled the body
 * yet), shows a placeholder block clearly marked as such so QA can
 * spot un-finalised text.
 */
export async function PolicyContent({ slug }: { slug: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("legal_documents")
    .select("body_md, version, effective_date")
    .eq("document_id", slug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{
      body_md: string | null;
      version: number;
      effective_date: string;
    }>();

  if (error || !data) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Policy text unavailable.</strong> Slug{" "}
        <code className="font-mono">{slug}</code> not found in{" "}
        <code className="font-mono">legal_documents</code>. Confirm the T-015
        seed migration has been applied + that T-014 has populated the row.
      </div>
    );
  }

  if (!data.body_md) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Policy text pending.</strong> Document{" "}
        <code className="font-mono">{slug}</code> (v{data.version}) exists but
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
        {data.body_md}
      </pre>
    </div>
  );
}
