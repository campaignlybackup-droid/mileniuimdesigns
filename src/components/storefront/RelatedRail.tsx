import type { JSX } from "react";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { StorefrontCard } from "@/lib/catalog/products";

export type RelatedRailProps = {
  title?: string;
  products: StorefrontCard[];
  marketSegment?: string;
  locale?: string;
  className?: string;
};

export function RelatedRail({
  title = "You May Also Like",
  products,
  marketSegment = "",
  locale = "en-US",
  className,
}: RelatedRailProps): JSX.Element | null {
  if (products.length === 0) return null;

  return (
    <section
      aria-label={title}
      className={className}
      style={{
        paddingTop: "var(--md-space-12, 48px)",
        borderTop: "1px solid var(--md-rule)",
        width: "100%",
      }}
    >
      <div style={{ marginBottom: "var(--md-space-6)" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--md-t-label, 0.75rem)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--md-fg-secondary)",
          }}
        >
          {title}
        </h2>
      </div>

      <div
        className="md-product-grid md-grid-4"
        style={{
          width: "100%",
        }}
      >
        {products.slice(0, 4).map((prod) => (
          <ProductCard
            key={prod.id}
            product={prod}
            marketSegment={marketSegment}
            locale={locale}
          />
        ))}
      </div>
    </section>
  );
}
