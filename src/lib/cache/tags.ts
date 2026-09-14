/**
 * Tag vocabulary — 01 §2.4, 08 §4.
 *
 * Two caches, one tag vocabulary. This is the only place tag strings are constructed.
 */
export const tags = {
  product: (id: string) => `product:${id}`,
  productSlug: (m: string, slug: string) => `product-slug:${m}:${slug}`,
  category: (id: string) => `category:${id}`,
  collection: (id: string) => `collection:${id}`,
  stone: (id: string) => `stone:${id}`,
  material: (id: string) => `material:${id}`,
  cmsPage: (id: string) => `cms:page:${id}`,
  cmsPost: (id: string) => `cms:post:${id}`,
  stonesIndex: () => "stones:index",
  journalIndex: () => "journal:index",
  nav: (m: string) => `nav:${m}`,
  market: (m: string) => `market:${m}`,
  settings: () => "settings",
  redirects: () => "redirects",
  sitemap: () => "sitemap",
} as const;
