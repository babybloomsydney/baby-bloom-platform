import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function NannyCTA() {
  return (
    <section className="py-8 border-t border-slate-100">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center">
          <p className="text-sm text-slate-500">
            Are you a nanny?
          </p>
          <Link
            href="/childcare-professionals"
            className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors inline-flex items-center gap-1"
          >
            Learn more
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
