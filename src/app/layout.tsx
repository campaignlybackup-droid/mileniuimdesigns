import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans, Cinzel } from "next/font/google";
import "./globals.css";

/**
 * Brand display font — Cormorant Garamond (Haute Joaillerie Serif).
 * Weights 300, 400, 500, 600, 700 with italics for editorial luxury.
 */
const cormorant = Cormorant_Garamond({
  variable: "--md-font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Modern luxury UI & body font — Plus Jakarta Sans.
 * Replaces generic AI builder fonts with clean, geometric luxury proportions.
 */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--md-font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Heritage Monogram & Royal Crest font — Cinzel.
 * Used for regal hallmarks, historical dating, and atelier insignia.
 */
const cinzel = Cinzel({
  variable: "--md-font-crest",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${cormorant.variable} ${plusJakarta.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
