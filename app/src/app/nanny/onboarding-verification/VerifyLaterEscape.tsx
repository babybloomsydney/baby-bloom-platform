"use client";

import Link from "next/link";

// Grey top-right hyperlink rendered on every onboarding-verification step.
// Bailey 2026-05-19 amendment: gives nannies an explicit escape hatch to
// their hub during onboarding without forcing the full verification flow.
// No analytics + no state mutation — pure routing. The hub renders the
// verification banner so the nanny can resume from there.

export function VerifyLaterEscape() {
  return (
    <Link
      href="/nanny"
      // text-slate-500 = ~4.83:1 contrast on white — meets WCAG AA 4.5:1 for
      // normal text. text-slate-400 fails (~2.85:1). a11y-architect 2026-05-19.
      className="absolute top-3 right-0 inline-flex min-h-[24px] items-center justify-center rounded px-2 py-1 text-xs text-slate-500 underline underline-offset-2 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
    >
      I&apos;ll verify later
    </Link>
  );
}
