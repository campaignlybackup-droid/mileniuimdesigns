import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";

/**
 * Brand display font — Cormorant Garamond (10 §2.2).
 * Self-hosting via next/font eliminates the runtime Google Fonts request (performance + privacy).
 * Weights 300 and 400; 300 italic for editorial standfirsts.
 */
const cormorant = Cormorant_Garamond({
  variable: "--md-font-display",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

/**
 * Brand UI font — Inter variable (10 §2.2).
 * Prices, SKUs, filters, forms, labels — anything that is not editorial.
 */
const inter = Inter({
  variable: "--md-font-sans",
  subsets: ["latin"],
  display: "swap",
});

/**
 * The site title is the client's own name, from their wordmark — not copy.
 *
 * There is deliberately NO `description`. A meta description is a positioning sentence about a
 * business with over 60 years of heritage, and writing one here would be inventing how the
 * business describes itself (hard rule §118). It is seeded empty and `/admin/settings/seo` is
 * where the client writes it; until then search engines compose one from the page, which is honest.
 */
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
      className={`${cormorant.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
