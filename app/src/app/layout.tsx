import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { VisitorTracker } from "@/components/providers/VisitorTracker";
import { DevToolbar } from "@/components/dev/DevToolbar";
import { DevSidebar } from "@/components/dev/DevSidebar";
import { Analytics } from "@vercel/analytics/next";
import { CookieConsentBanner } from "@/components/legal/CookieConsentBanner";
import { MiniFooter } from "@/components/layout/MiniFooter";
import Script from "next/script";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
const isProd = process.env.NODE_ENV === 'production';

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
  metadataBase: new URL('https://babybloomsydney.com.au'),
  title: {
    template: '%s | Baby Bloom Sydney',
    default: 'Baby Bloom Sydney — Verified Nannies for Sydney Families',
  },
  description: 'Find trusted, WWCC-verified nannies in Sydney. Baby Bloom matches families with background-checked, education-focused childcare professionals.',
  openGraph: {
    siteName: 'Baby Bloom Sydney',
    locale: 'en_AU',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Baby Bloom Sydney',
    alternateName: 'Baby Bloom',
    url: 'https://babybloomsydney.com.au',
    logo: 'https://babybloomsydney.com.au/logo.png',
    description: "Sydney's trusted platform for connecting families with verified, WWCC-checked nannies and babysitters.",
    foundingDate: '2020',
    areaServed: {
      '@type': 'City',
      name: 'Sydney',
      addressRegion: 'NSW',
      addressCountry: 'AU',
    },
    sameAs: [],
  };

  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd).replace(/</g, '\\u003c'),
          }}
        />
        <SessionProvider>
          <VisitorTracker />
          {isDevMode && <DevSidebar />}
          {children}
          <MiniFooter />
          <Analytics />
          <CookieConsentBanner />
          {isDevMode && <DevToolbar />}
        </SessionProvider>
        {isProd && (
          <>
            <Script
              src="https://browser.sentry-cdn.com/8.46.0/bundle.min.js"
              crossOrigin="anonymous"
              strategy="afterInteractive"
            />
            <Script id="sentry-init" strategy="afterInteractive">
              {`
                if (typeof Sentry !== 'undefined') {
                  Sentry.init({
                    dsn: "https://0a45d54c5424e8f1ee27c7143617571f@o4511097907904512.ingest.us.sentry.io/4511097920225280",
                    tracesSampleRate: 0.1,
                  });
                }
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
