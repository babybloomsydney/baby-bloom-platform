import Link from "next/link";

/**
 * Renders a single link to the canonical T&C page for the given slug.
 * Used next to a `ConsentCheckbox` inside the add-child sheets, the
 * consent-renewal modal, and the invite-landing client.
 *
 * Previously an async Server Component that inlined the full body_md
 * — that approach leaked `createAdminClient` into client chunks and
 * produced the V2.1 white-screen on parent add-child. This minimal
 * link-only render fixes the bug without inlining policy copy.
 */
const SLUG_TO_LEGAL_PAGE: Record<string, string> = {
  "parent-app-consent": "/legal/client-terms",
  "nanny-attestation": "/legal/professional-terms",
};

export function PolicyContent({ slug }: { slug: string }) {
  const href = SLUG_TO_LEGAL_PAGE[slug] ?? `/legal/${slug}`;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-violet-600 underline hover:text-violet-700"
    >
      View policy
    </Link>
  );
}
