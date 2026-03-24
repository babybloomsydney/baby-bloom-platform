import Link from "next/link";

export function MiniFooter() {
  return (
    <div className="flex justify-center gap-3 text-[10px] text-slate-400 py-3">
      <Link href="/about" className="hover:underline">About</Link>
      <Link href="/legal/privacy-policy" className="hover:underline">Privacy</Link>
      <Link href="/legal/client-terms" className="hover:underline">Terms</Link>
    </div>
  );
}
