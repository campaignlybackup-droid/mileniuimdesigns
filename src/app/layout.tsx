import type { Metadata } from "next";
import { Bodoni_Moda, Italiana, Cinzel, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Primary Haute Joaillerie Display Font — Bodoni Moda.
 * Extreme high-contrast luxury serif used in Italian haute couture and high-jewelry monographs.
 */
const bodoni = Bodoni_Moda({
  variable: "--md-font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Classical Roman Grace & Accent Font — Italiana.
 * Evokes classical Mediterranean sculpture and museum curation.
 */
const italiana = Italiana({
  variable: "--md-font-accent",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

/**
 * Imperial Crest & Hallmarking Font — Cinzel.
 * Used for royal hallmarks, archival dates, and atelier seals.
 */
const cinzel = Cinzel({
  variable: "--md-font-crest",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

/**
 * Refined Modern Luxury Sans — Plus Jakarta Sans.
 * Clear, crisp geometric proportions for technical gemological notes and prices.
 */
const sans = Plus_Jakarta_Sans({
  variable: "--md-font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://millenniumdesigns.in"
  ),
  title: {
    default: "Millennium Designs · Pure 925 Sterling Silver Jewellery",
    template: "%s · Millennium Designs",
  },
  description:
    "Discover handcrafted pure 925 sterling silver rings, necklaces, earrings, bracelets, and bespoke gemstone creations. Hallmarked silver jewellery delivered across India & worldwide.",
  keywords: [
    "pure silver jewellery",
    "925 sterling silver",
    "silver jewellery online india",
    "handcrafted silver rings",
    "pure silver necklaces",
    "sterling silver earrings",
    "hallmarked 925 silver",
    "luxury silver brand",
    "Millennium Designs",
  ],
  authors: [{ name: "Millennium Designs", url: "https://millenniumdesigns.in" }],
  creator: "Millennium Designs",
  publisher: "Millennium Designs",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://millenniumdesigns.in",
    siteName: "Millennium Designs",
    title: "Millennium Designs · Pure 925 Sterling Silver Jewellery",
    description:
      "Handcrafted pure 925 sterling silver jewellery with timeless elegance. Shop rings, necklaces, earrings, and certified silver jewellery.",
    images: [
      {
        url: "/images/og-brand.jpg",
        width: 1200,
        height: 630,
        alt: "Millennium Designs - Pure 925 Sterling Silver Jewellery",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Millennium Designs · Pure 925 Sterling Silver Jewellery",
    description:
      "Handcrafted pure 925 sterling silver jewellery with timeless elegance.",
    images: ["/images/og-brand.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const orgJsonLd = buildOrganizationJsonLd();
  const webSiteJsonLd = buildWebSiteJsonLd();

  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${italiana.variable} ${cinzel.variable} ${sans.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
