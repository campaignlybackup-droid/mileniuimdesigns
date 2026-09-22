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

export const metadata: Metadata = {
  title: { default: "MILLENNIUM DESIGNS", template: "%s · MILLENNIUM DESIGNS" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${italiana.variable} ${cinzel.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
