import type { JSX } from "react";
import { notFound } from "next/navigation";
import { resolveMarket } from "@/lib/market";

export const revalidate = 600;

export default async function CmsPageRoute({
  params,
}: {
  params: Promise<{ market: string; slug: string[] }>;
}): Promise<JSX.Element> {
  const { market } = await params;
  await resolveMarket(market);

  // P21 builds the full CMS page builder engine; for P15 unknown page slugs 404
  notFound();
}

