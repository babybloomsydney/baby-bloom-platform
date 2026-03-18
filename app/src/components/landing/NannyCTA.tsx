import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle } from "lucide-react";

const BENEFITS = [
  "Families who value quality childcare",
  "Own rates. Own schedule. No commission.",
  "Verified professional profile",
];

export function NannyCTA() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — benefits */}
          <div className="order-2 lg:order-1">
            <div className="bg-violet-50 rounded-2xl p-8 md:p-10 space-y-5">
              {BENEFITS.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-violet-200 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle className="w-4 h-4 text-violet-600" />
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed pt-1">
                    {benefit}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — copy */}
          <div className="order-1 lg:order-2">
            <span className="text-sm font-medium text-violet-600 uppercase tracking-wider">
              For Nannies
            </span>
            <h2 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900">
              Early childhood professionals
            </h2>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Nannies who take child development seriously, matched with families who share that standard.
            </p>
            <div className="mt-8">
              <Button
                size="lg"
                asChild
                className="bg-violet-500 hover:bg-violet-600 text-base h-12 px-8"
              >
                <Link href="/for-nannies">
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
