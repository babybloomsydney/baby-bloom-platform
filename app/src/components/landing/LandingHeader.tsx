"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const DASHBOARDS: Record<string, string> = {
  nanny: "/nanny",
  parent: "/parent",
  admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

const HIDDEN_PATHS = ["/matchmaking/onboarding", "/position/"];

// useSearchParams forces the closest Suspense boundary to client-render;
// wrapping the body in our own Suspense localises that cost to the header
// rather than bailing every page out of static optimisation.
function LandingHeaderInner() {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dashboard = role ? DASHBOARDS[role] : null;

  // Headless funnel: when arriving via the parent-onboarding URL contract,
  // suppress the header so the surface reads as part of the funnel rather
  // than a public landing page. See `lib/funnel/source.ts` + T-039 Slice B.
  const funnelSrc = searchParams.get("src");
  if (funnelSrc === "std" || funnelSrc === "adv") return null;

  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  // Default to the logged-out variant so the right side never goes blank
  // during the useAuth() bootstrap window. The Back-to-Dashboard swap
  // happens whenever user + dashboard are both populated — no isLoading
  // gate, so the swap is the same render React already handles for any
  // state change.
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href={dashboard || "/"} className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-slate-900">Baby</span>
          <span className="text-xl font-bold text-violet-500">Bloom</span>
        </Link>

        {user && dashboard ? (
          <Link href={dashboard}>
            <Button
              size="sm"
              variant="ghost"
              className="text-sm text-violet-600"
            >
              Back to Dashboard
            </Button>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="text-sm text-slate-600"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/signup">
              <Button
                size="sm"
                className="bg-violet-500 hover:bg-violet-600 text-sm"
              >
                Get Started
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export function LandingHeader() {
  return (
    <Suspense fallback={null}>
      <LandingHeaderInner />
    </Suspense>
  );
}
