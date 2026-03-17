import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Apply to Nanny with Baby Bloom',
  description: 'Join Baby Bloom as a professional nanny in Sydney. Complete your application and get matched with families.',
};

export default function ApplyNannyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-2xl mx-auto px-4 lg:px-6">
        {children}
      </main>
    </div>
  );
}
