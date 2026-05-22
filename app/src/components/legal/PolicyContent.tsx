import Link from "next/link";

/**
 * Renders a small inline link to the canonical T&C / policy page that
 * the in-form consent checkbox is referring to. Lives next to the
 * `ConsentCheckbox` inside the add-child sheets, the consent-renewal
 * modal, and the invite-landing client.
 *
 * Was previously an async Server Component that inlined the full
 * `legal_documents.body_md` body. Inlining the policy text was both
 * undesired (BAI 2026-05-22 — the canonical policy pages already exist
 * at `/legal/*` and the consent dialog should LINK to them, not
 * duplicate the wall of copy) and broken (the Server Component leaked
 * `createAdminClient` into client chunks via the four `'use client'`
 * call sites, producing the V2.1 white-screen on parent add-child).
 *
 * Now: plain `next/link` to the relevant `/legal/{slug}` page. No DB
 * fetch, no client/server-component import dance. Pure client-safe.
 */

const SLUG_TO_LEGAL_PAGE: Record<string, string> = {
  "parent-app-consent": "/legal/client-terms",
  "nanny-attestation": "/legal/professional-terms",
};

export function PolicyContent({ slug }: { slug: string }) {
  const href = SLUG_TO_LEGAL_PAGE[slug] ?? `/legal/${slug}`;
  return (
    <p className="text-xs text-slate-600">
      Read the{" "}
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-600 underline hover:text-violet-700"
      >
        full policy
      </Link>
      .
    </p>
  );
}
