import type { JSX } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontCard } from "@/lib/catalog/products";

export type ProductGridProps = {
  products: StorefrontCard[];
  marketSegment?: string;
  locale?: string;
  columns?: 2 | 3 | 4;
  className?: string;
};

export function ProductGrid({
  products,
  marketSegment = "",
  locale = "en-US",
  columns = 3,
  className,
}: ProductGridProps): JSX.Element {
  if (products.length === 0) {
    return <div className={className} />;
  }

  const columnClass =
    columns === 2
      ? "md-grid-2"
      : columns === 4
        ? "md-grid-4"
        : "md-grid-3";

  return (
    <div
      className={`md-product-grid ${columnClass} ${className ?? ""}`}
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {products.map((product, idx) => (
        <ProductCard
          key={product.id}
          product={product}
          marketSegment={marketSegment}
          locale={locale}
          priority={idx < 4}
        />
      ))}
    </div>
  );
}
