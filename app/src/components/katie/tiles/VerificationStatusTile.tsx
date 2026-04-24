"use client";

/**
 * VerificationStatusTile — the verification ladder, rendered inline in
 * Katie's chat.
 *
 * Architectural commitment (see TileRegistry.tsx): interactive /
 * data-backed tiles import the EXACT SAME component rendered on the
 * main site so there's zero drift between Katie's view and the
 * standalone surface. For verification that component is
 * `src/components/verification/VerificationProgress.tsx` — the stepper
 * used in the design system / brandkit.
 *
 * Step derivation happens server-side (see
 * `src/lib/chat/modules/verification.ts` → `deriveVerificationSteps`)
 * so the browser never sees raw `verification_level` / `verification_status`
 * codes. We just receive pre-computed `{ label, status }` pairs here
 * and hand them to the stepper.
 *
 * Provisional UX rule: for a level-3 nanny the server emits all steps
 * with `status: "verified"` so the tile reads "Verified" without
 * mentioning the pending final check. That detail lives in the
 * VerificationSummary's `only_if_asked` list, which Katie only
 * surfaces on direct question.
 */

import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { VerificationProgress } from "@/components/verification/VerificationProgress";
import type { VerificationStatusChatTile as TileData } from "@/lib/chat/tiles";

export function VerificationStatusTile({ tile }: { tile: TileData }) {
  const { headline, steps, action } = tile.data;
  const isVerified = /you'?re (fully )?verified/i.test(headline);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <header className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isVerified ? "bg-green-100" : "bg-violet-100"
          }`}
        >
          <ShieldCheck
            className={`h-3.5 w-3.5 ${
              isVerified ? "text-green-600" : "text-violet-600"
            }`}
          />
        </div>
        <span
          className={`text-xs font-medium ${
            isVerified ? "text-green-700" : "text-violet-700"
          }`}
        >
          {isVerified ? "Verified ✓" : "Verification"}
        </span>
      </header>

      <div className="mt-3 space-y-3">
        <p className="text-sm font-semibold text-slate-900">{headline}</p>

        {steps.length > 0 ? (
          <div className="rounded-lg bg-slate-50 p-3">
            <VerificationProgress steps={steps} />
          </div>
        ) : null}

        {action ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
