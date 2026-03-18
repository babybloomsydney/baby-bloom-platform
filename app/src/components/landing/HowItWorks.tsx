import { Search, MessageCircle, Users, Heart } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    label: "Search",
    description: "Suburb and schedule in. Matched nannies out.",
  },
  {
    icon: MessageCircle,
    label: "Connect",
    description: "Request a nanny. Response within days.",
  },
  {
    icon: Users,
    label: "Meet",
    description: "Meet in person. See if it\u2019s right.",
  },
  {
    icon: Heart,
    label: "Start",
    description: "Agree on terms. Begin.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
            How it works
          </h2>
          <p className="mt-3 text-slate-500">
            Search. Match. Meet. Start.
          </p>
        </div>

        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <div
              key={step.label}
              className="relative bg-white rounded-xl p-6 border border-slate-200 hover:border-violet-200 hover:shadow-md transition-all"
            >
              <div className="absolute top-4 right-4 text-4xl font-bold text-slate-100">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="w-12 h-12 rounded-lg bg-violet-100 flex items-center justify-center mb-4">
                <step.icon className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="font-semibold text-slate-900 text-lg">
                {step.label}
              </h3>
              <p className="mt-2 text-slate-500 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
