import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Baby Bloom Sydney. We help families find verified nannies and help childcare professionals connect with great families.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">Contact Us</h1>
    </div>
  );
}
