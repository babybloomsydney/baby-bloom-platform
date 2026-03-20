import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { NannyPreviewCard, type NannyPreview } from "./NannyPreviewCard";

interface BrowsePreviewProps {
  nannies: NannyPreview[];
}

export function BrowsePreview({ nannies }: BrowsePreviewProps) {
  if (nannies.length === 0) return null;

  return (
    <section className="py-16 md:py-24 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        {/* Heading — visible on mobile above cards, hidden on lg (shown in right column instead) */}
        <div className="text-center mb-8 lg:hidden">
          <h2 className="text-2xl font-bold text-slate-900">
            Education-led childcare. Expertly matched.
          </h2>
          <p className="mt-3 text-base text-slate-600">
            Not a just supervision. An aligned mission
          </p>
        </div>

        <div className="grid lg:grid-cols-[3fr_2fr] gap-10 lg:gap-16 items-center">
          {/* Left — nanny cards, always stacked */}
          <div className="flex flex-col gap-4">
            {nannies.map((nanny) => (
              <NannyPreviewCard key={nanny.id} nanny={nanny} />
            ))}
          </div>

          {/* Right — CTA (heading only visible on lg+) */}
          <div className="hidden lg:block">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Education-led childcare. Expertly matched.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Not a just supervision. An aligned mission
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                asChild
                className="bg-violet-500 hover:bg-violet-600 text-white text-base h-12 px-8"
              >
                <a href="#quick-match">
                  Find your Nanny
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="text-base h-12 px-8 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                <Link href="/nannies">
                  Browse all nannies
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Buttons — visible on mobile below cards, hidden on lg */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-center items-center gap-4 lg:hidden">
          <Button
            size="lg"
            asChild
            className="bg-violet-500 hover:bg-violet-600 text-white text-base h-12 px-8 w-full sm:w-auto max-w-[280px] sm:max-w-none"
          >
            <a href="#quick-match">
              Find your Nanny
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            asChild
            className="text-sm h-10 px-5 sm:text-base sm:h-12 sm:px-8 border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <Link href="/nannies">
              Browse all nannies
              <ArrowRight className="ml-1.5 sm:ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
