import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { VisitorTracker } from "@/components/providers/VisitorTracker";
import { DevToolbar } from "@/components/dev/DevToolbar";
import { DevSidebar } from "@/components/dev/DevSidebar";
import { Analytics } from "@vercel/analytics/next";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Baby Bloom Sydney - Find Your Perfect Nanny",
    template: "%s | Baby Bloom Sydney",
  },
  description: "Connect with verified, trusted nannies in Sydney. Baby Bloom helps families find the perfect nanny match with WWCC verified, police-checked childcare professionals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <SessionProvider>
          <VisitorTracker />
          {isDevMode && <DevSidebar />}
          {children}
          <Analytics />
          <CookieConsentBanner />
          {isDevMode && <DevToolbar />}
        </SessionProvider>
      </body>
    </html>
  );
}
