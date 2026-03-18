import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="bg-slate-50 py-16 md:py-20">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
            Education-led childcare. Expertly matched.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Not a just supervision. An aligned mission
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              asChild
              className="bg-violet-500 hover:bg-violet-600 text-white text-base h-12 px-8"
            >
              <a href="#quick-match">
                Find your Nanny
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
