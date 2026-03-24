export const metadata = {
  title: 'Legal',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        {children}
      </div>
    </div>
  );
}
