"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const DASHBOARDS: Record<string, string> = {
  nanny: "/nanny",
  parent: "/parent",
  admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
};

const HIDDEN_PATHS = ["/matchmaking/onboarding", "/position/"];

export function LandingHeader() {
  const { user, role, isLoading } = useAuth();
  const pathname = usePathname();
  const dashboard = role ? DASHBOARDS[role] : null;

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href={dashboard || "/"} className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-slate-900">Baby</span>
          <span className="text-xl font-bold text-violet-500">Bloom</span>
        </Link>

        {!isLoading && (
          user && dashboard ? (
            <Link href={dashboard}>
              <Button size="sm" variant="ghost" className="text-sm text-violet-600">
                Back to Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-sm text-slate-600">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-sm">
                  Get Started
                </Button>
              </Link>
            </div>
          )
        )}
      </div>
    </header>
  );
}
