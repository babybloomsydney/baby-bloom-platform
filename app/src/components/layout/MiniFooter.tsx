'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDDEN_PATHS = ['/parent/request', '/matchmaking/onboarding'];

export function MiniFooter() {
  const pathname = usePathname();
  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null;

  return (
    <div className="flex justify-center gap-3 text-[10px] text-slate-400 py-3">
      <Link href="/about" className="hover:underline">About</Link>
      <Link href="/legal/privacy-policy" className="hover:underline">Privacy</Link>
      <Link href="/legal/client-terms" className="hover:underline">Terms</Link>
    </div>
  );
}
