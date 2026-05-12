import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ParentDashboard } from "./ParentDashboard";
import { ParentStateBannerHub } from "@/components/payments/ParentStateBannerHub";
import { deriveParentBannerState } from "@/lib/payments/parent-banner-state";

// UX-FIX-PLAN FIX-11 (2026-05-12 audit) — role-scoped tab title
// default so authed pages don't inherit the public landing page
// copy. Individual pages can still override via their own
// `metadata` exports.
export const metadata: Metadata = {
  title: "Parent dashboard | Baby Bloom Sydney",
  robots: { index: false, follow: false },
};

// Server-side payment-state derivation runs on every parent route
// load — must not be served from a stale Next.js fetch cache. The
// banner state must reflect the current row at request time.
export const dynamic = "force-dynamic";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauth'd visitors don't hit this layout in practice (middleware
  // intercepts), but the null-safety keeps the fallback path clean.
  const bannerState = user
    ? await deriveParentBannerState({ parentUserId: user.id })
    : { kind: "none" as const };

  return (
    <ParentDashboard>
      <ParentStateBannerHub state={bannerState} />
      {children}
    </ParentDashboard>
  );
}
