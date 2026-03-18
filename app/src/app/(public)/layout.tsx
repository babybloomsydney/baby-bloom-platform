import { LandingHeader } from "@/components/landing/LandingHeader";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />
      {children}
    </div>
  );
}
