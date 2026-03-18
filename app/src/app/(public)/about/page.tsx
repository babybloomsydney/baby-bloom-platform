import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
  UserCheck,
} from "lucide-react";

const DIFFERENTIATORS = [
  {
    icon: ShieldCheck,
    title: "Not a marketplace",
    description:
      "Every nanny expertly vetted — identity, credentials, and experience verified before joining. Matched by location, schedule, experience, and values. Best-fit nannies contacted directly.",
  },
  {
    icon: GraduationCap,
    title: "Education as standard",
    description:
      "Nannies who understand developmental milestones, structured play, and early learning. The baseline, not the exception. Every match starts from this standard.",
  },
  {
    icon: UserCheck,
    title: "Personal, not automated",
    description:
      "Matching considers the full picture — experience, approach, and fit. Not just availability and proximity.",
  },
  {
    icon: Heart,
    title: "No middleman fees",
    description:
      "Free for families. Nannies keep what they earn. No fees, no commission, no placement cost.",
  },
  {
    icon: Sparkles,
    title: "Built to improve",
    description:
      "Matching, vetting, and support get better with every family and every nanny.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-white to-violet-50/30" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-200/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative container mx-auto px-4 md:px-6 py-20 md:py-32">
          <div className="max-w-3xl">
            <span className="inline-block text-xs font-semibold text-violet-500 uppercase tracking-[0.2em] mb-4">
              About Baby Bloom
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-[1.1] tracking-tight">
              The early years shape everything that follows.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl">
              An education company matching Sydney families with nannies who
              understand child development. Free matching. Non-negotiable
              standards.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ THE APPROACH ═══ */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-8">
              What that looks like
            </h2>
            <div className="relative">
              <div className="absolute -left-3 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-400 to-violet-200 rounded-full" />
              <div className="pl-6 md:pl-8 space-y-5 text-slate-600 leading-relaxed">
                <p>
                  How a child learns to play, to explore, to trust — it starts
                  with the people who care for them. The quality of that care in
                  the first five years sets the foundation for everything that
                  comes after.
                </p>
                <p>
                  Connecting families with nannies who understand this. Carers
                  who see structured play as learning, track developmental
                  milestones, and treat every day as an opportunity to help a
                  child grow.
                </p>
                <p className="text-slate-900 font-medium">
                  Finding, vetting, and matching — handled. So families can focus
                  on what matters.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WHAT'S DIFFERENT ═══ */}
      <section className="py-16 md:py-24 bg-slate-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl mb-12 md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              What&apos;s different
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {DIFFERENTIATORS.map((item) => (
              <div
                key={item.title}
                className="group bg-white rounded-2xl p-7 md:p-8 border border-slate-200/80 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/50 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center mb-5 group-hover:bg-violet-500 transition-colors duration-300">
                  <item.icon className="w-5 h-5 text-violet-600 group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ EMOTIONAL BRIDGE ═══ */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-2xl md:text-3xl lg:text-[2rem] italic text-slate-700 leading-relaxed tracking-tight">
              The person who cares for a child during these years is one of the
              most important decisions a parent makes.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative bg-slate-900 py-16 md:py-24 overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

        <div className="relative container mx-auto px-4 md:px-6">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Find the right nanny for every family
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Childcare professionals welcome too.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                asChild
                className="bg-violet-500 hover:bg-violet-600 text-white text-base h-12 px-8 shadow-lg shadow-violet-500/20"
              >
                <Link href="/">
                  Find a Nanny
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white text-base h-12 px-8"
              >
                <Link href="/nanny/apply">Apply as a Nanny</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
