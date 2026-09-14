import { NextResponse } from "next/server";
import { enumerateSitemap } from "@/lib/seo";

export const revalidate = 3600;

/**
 * Sharded sitemap handler — 01 §1.3, 08 §4.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ shard: string }> },
): Promise<NextResponse> {
  const { shard } = await context.params;
  const urls = await enumerateSitemap(shard);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}
    ${u.priority ? `<priority>${u.priority}</priority>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
