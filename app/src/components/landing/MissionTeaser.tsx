import Link from "next/link";

export function MissionTeaser() {
  return (
    <section className="py-16 md:py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
            Early years matter
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Foundations are set in the first five years. The right care during this period changes everything.
          </p>
          <Link
            href="/about"
            className="inline-block mt-6 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
          >
            More about Baby Bloom &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
