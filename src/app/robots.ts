import type { MetadataRoute } from "next";
import { env } from "@/lib/config/env";

export default function robots(): MetadataRoute.Robots {
  let domain = "https://millenniumdesigns.com";
  try {
    domain = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  } catch {
    // fallback
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/checkout/"],
      },
    ],
    sitemap: [
      `${domain}/sitemaps/products-1`,
      `${domain}/sitemaps/categories`,
      `${domain}/sitemaps/stones`,
    ],
  };
}
