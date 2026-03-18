import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-slate-900">Baby</span>
          <span className="text-xl font-bold text-violet-500">Bloom</span>
        </Link>

        {/* Auth buttons */}
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
      </div>
    </header>
  );
}
