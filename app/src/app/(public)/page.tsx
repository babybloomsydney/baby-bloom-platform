import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Heart, Shield, Clock, Users, ArrowRight, CheckCircle } from "lucide-react";

export default function HomePage() {
  return (
    <>
      {/* Hero Section - Asymmetric Layout */}
      <section className="relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-20 right-[10%] w-72 h-72 bg-violet-100 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-10 left-[5%] w-48 h-48 bg-violet-200 rounded-full blur-2xl opacity-40" />

        <div className="container mx-auto px-4 md:px-6 py-16 md:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Content */}
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-50 text-violet-600 text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                Sydney&apos;s trusted nanny network
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
                Find your perfect
                <span className="block text-violet-500 mt-1">Sydney nanny</span>
              </h1>

              <p className="mt-6 text-lg text-slate-600 max-w-lg leading-relaxed">
                Skip the endless scrolling. We&apos;ve already vetted Sydney&apos;s best nannies so you can focus on finding the right fit for your family.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild className="bg-violet-500 hover:bg-violet-600 text-base h-12 px-8">
                  <Link href="/nannies">
                    Find a Nanny
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base h-12 px-8 border-slate-300">
                  <Link href="/apply/nanny">
                    Apply as a childcare professional
                  </Link>
                </Button>
              </div>

              {/* Trust Indicators */}
              <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-500" />
                  <span>WWCC verified</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-500" />
                  <span>Police checked</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-violet-500" />
                  <span>First aid trained</span>
                </div>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="relative lg:ml-8">
              {/* Main card */}
              <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 p-6 md:p-8">
                <div className="space-y-4">
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-violet-50 rounded-xl p-4">
                      <div className="text-3xl font-bold text-violet-600">200+</div>
                      <div className="text-sm text-slate-600 mt-1">Verified nannies</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-3xl font-bold text-slate-900">500+</div>
                      <div className="text-sm text-slate-600 mt-1">Happy families</div>
                    </div>
                  </div>

                  {/* Recent activity indicator */}
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-violet-200 border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-violet-300 border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-violet-400 border-2 border-white" />
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-slate-900">12 nannies</span>
                      <span className="text-slate-500"> joined this week</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating accent elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-violet-100 rounded-2xl -z-10 rotate-6" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-violet-50 rounded-full -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-slate-50 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Finding childcare shouldn&apos;t be stressful
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              We do the hard work upfront so you can spend time on what matters.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Users,
                title: "Browse profiles",
                description: "See real nannies with verified credentials, not anonymous listings.",
                step: "01",
              },
              {
                icon: Shield,
                title: "Trust the vetting",
                description: "Every nanny passes our 3-tier verification: WWCC, police check, and references.",
                step: "02",
              },
              {
                icon: Heart,
                title: "Find your match",
                description: "Filter by experience, availability, and the things that matter to your family.",
                step: "03",
              },
              {
                icon: Clock,
                title: "Book with ease",
                description: "Request interviews, hire permanently, or book one-off babysitting.",
                step: "04",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="relative bg-white rounded-xl p-6 border border-slate-200 hover:border-violet-200 hover:shadow-md transition-all"
              >
                <div className="absolute top-4 right-4 text-4xl font-bold text-slate-100">
                  {item.step}
                </div>
                <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="font-semibold text-slate-900 text-lg">{item.title}</h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Nannies Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - decorative */}
            <div className="relative order-2 lg:order-1">
              <div className="bg-violet-50 rounded-2xl p-8 md:p-10">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-violet-200 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900">Set your own rates</h4>
                      <p className="text-sm text-slate-600 mt-1">You decide what you&apos;re worth. We just connect you with families.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-violet-200 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900">Flexible scheduling</h4>
                      <p className="text-sm text-slate-600 mt-1">Full-time, part-time, or casual babysitting - your choice.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-violet-200 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-900">Professional profile</h4>
                      <p className="text-sm text-slate-600 mt-1">We help you shine with AI-written bios and verified credentials.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right side - content */}
            <div className="order-1 lg:order-2">
              <span className="text-sm font-medium text-violet-600 uppercase tracking-wider">
                For Nannies
              </span>
              <h2 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900">
                Your next family is looking for you
              </h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed">
                Join Sydney&apos;s growing network of professional nannies. Get matched with families who value what you bring, not just anyone who needs childcare.
              </p>
              <div className="mt-8">
                <Button size="lg" asChild className="bg-violet-500 hover:bg-violet-600 text-base h-12 px-8">
                  <Link href="/apply/nanny">
                    Apply as a childcare professional
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-slate-900 py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Ready to find your family&apos;s perfect match?
            </h2>
            <p className="mt-4 text-lg text-slate-400">
              Join hundreds of Sydney families who found their nanny through Baby Bloom.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-violet-500 hover:bg-violet-600 text-base h-12 px-8">
                <Link href="/nannies">
                  Browse Nannies
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-base h-12 px-8 border-slate-700 text-white hover:bg-slate-800">
                <Link href="/signup">
                  Create Account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
