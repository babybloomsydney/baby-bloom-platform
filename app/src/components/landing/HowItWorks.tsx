import { Check } from "lucide-react";

const STEPS = [
  { label: "Connect", description: "Find your perfect nanny", state: "completed" as const },
  { label: "Meet", description: "Get to know eachother", state: "current" as const },
  { label: "Start", description: "Begin your journey together", state: "future" as const },
];

function StepCircle({ state }: { state: "completed" | "current" | "future" }) {
  if (state === "completed") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-green-500 bg-green-500">
        <Check className="h-4 w-4 text-white" />
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-violet-500 bg-violet-50 ring-2 ring-violet-200">
        <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white" />
  );
}

function connectorColor(state: "completed" | "current" | "future") {
  if (state === "completed") return "bg-green-300";
  if (state === "current") return "bg-violet-200";
  return "bg-slate-100";
}

export function HowItWorks() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
            How it works
          </h2>
          <p className="mt-3 text-slate-500">
            
          </p>
        </div>

        {/* ─── Desktop stepper (horizontal) ─── */}
        <div className="hidden md:block max-w-2xl mx-auto">
          <div className="flex">
            {STEPS.map((step, i) => {
              const isFirst = i === 0;
              const isLast = i === STEPS.length - 1;
              const leftColor = isFirst ? "bg-transparent" : connectorColor(STEPS[i - 1].state);
              const rightColor = isLast ? "bg-transparent" : connectorColor(step.state);

              const labelClass = step.state === "completed"
                ? "text-sm font-medium text-green-700"
                : step.state === "current"
                ? "text-sm font-semibold text-violet-700"
                : "text-sm text-slate-300";

              return (
                <div key={step.label} className="flex-1 flex flex-col items-center">
                  <div className="flex items-center w-full h-7">
                    <div className={`flex-1 h-0.5 ${leftColor}`} />
                    <div className="flex items-center justify-center w-7 h-7">
                      <StepCircle state={step.state} />
                    </div>
                    <div className={`flex-1 h-0.5 ${rightColor}`} />
                  </div>
                  <p className={`mt-3 ${labelClass}`}>
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed text-center max-w-[180px]">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Mobile stepper (vertical) ─── */}
        <div className="md:hidden flex justify-center">
          <div className="flex flex-col">
          {STEPS.map((step, i) => {
            const isLast = i === STEPS.length - 1;

            const labelClass = step.state === "completed"
              ? "text-xs leading-5 font-medium text-green-700"
              : step.state === "current"
              ? "text-sm leading-7 font-semibold text-violet-700"
              : "text-xs leading-5 text-slate-300";

            return (
              <div key={step.label} className="flex gap-3">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <StepCircle state={step.state} />
                  {!isLast && <div className={`w-0.5 flex-1 ${connectorColor(step.state)}`} />}
                </div>
                <div className={isLast ? "pb-0" : step.state === "current" ? "pb-1" : "pb-0.5"}>
                  <p className={labelClass}>
                    {step.label}
                  </p>
                  <p className={`text-xs leading-relaxed ${step.state === "future" ? "text-slate-300" : "text-slate-500"}`}>
                    {step.description}
                  </p>
                  {!isLast && <div className={step.state === "current" ? "h-5" : "h-2"} />}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}
