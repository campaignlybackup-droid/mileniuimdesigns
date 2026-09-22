"use client";

import { useState, type JSX } from "react";
import Link from "next/link";
import { PriceDisplay } from "@/components/storefront/PriceDisplay";
import { VariantSelector } from "@/components/storefront/VariantSelector";
import { AddToBag } from "@/components/storefront/AddToBag";
import { AvailabilityBadge } from "@/components/storefront/AvailabilityBadge";
import type { PdpProduct, PdpVariant } from "@/lib/catalog/products";
import type { AvailabilityBand } from "@/types/inventory";

import { RingSizeGuideModal } from "@/components/storefront/RingSizeGuideModal";
import { buildWhatsAppInquiryUrl } from "@/lib/whatsapp";

export type ProductInfoProps = {
  product: PdpProduct;
  marketCode: string;
  marketSegment?: string;
  locale?: string;
  initialBand?: AvailabilityBand;
};

export function ProductInfo({
  product,
  marketCode,
  marketSegment = "",
  locale = "en-US",
  initialBand = "in_stock",
}: ProductInfoProps): JSX.Element {
  const [selectedVariant, setSelectedVariant] = useState<PdpVariant | null>(
    product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null,
  );
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    story: true,
  });
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const stonesLine = product.stones.map((s) => s.name).join(" · ");
  const materialsLine = product.materials.map((m) => m.name).join(" · ");
  const stoneAndMaterial = [stonesLine, materialsLine].filter(Boolean).join(" · ");

  const isSold = Boolean(product.soldAt);
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;

  const isRing = product.slug.includes("ring") || product.options.some((o) => o.name.toLowerCase().includes("size"));

  const whatsappInquiryUrl = buildWhatsAppInquiryUrl({
    topic: "bespoke",
    productTitle: product.title,
    customMessage: `Hello Millennium Designs Jaipur, I am viewing "${product.title}" (${product.slug}) and would like to inquire about bespoke sizing or craftsmanship details.`,
  });

  // Description string or JSON extraction
  let descriptionText = "";
  if (typeof product.descriptionJson === "string") {
    descriptionText = product.descriptionJson;
  } else if (
    product.descriptionJson &&
    typeof product.descriptionJson === "object" &&
    "text" in (product.descriptionJson as Record<string, unknown>)
  ) {
    descriptionText = String((product.descriptionJson as Record<string, unknown>).text);
  }

  let careText = "";
  if (typeof product.careInstructionsJson === "string") {
    careText = product.careInstructionsJson;
  } else if (
    product.careInstructionsJson &&
    typeof product.careInstructionsJson === "object" &&
    "text" in (product.careInstructionsJson as Record<string, unknown>)
  ) {
    careText = String((product.careInstructionsJson as Record<string, unknown>).text);
  }

  // Accordion definitions
  const accordions: { key: string; title: string; content: React.ReactNode }[] = [];

  if (descriptionText) {
    accordions.push({
      key: "story",
      title: "The Story",
      content: <div style={{ lineHeight: 1.6, color: "var(--md-fg-secondary)" }}>{descriptionText}</div>,
    });
  }

  if (product.attributes.length > 0) {
    accordions.push({
      key: "details",
      title: "Details",
      content: (
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--md-space-2) var(--md-space-4)", fontSize: "0.875rem" }}>
          {product.attributes.map((attr, i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt style={{ color: "var(--md-fg-secondary)" }}>{attr.name}</dt>
              <dd style={{ margin: 0, color: "var(--md-fg)" }}>{attr.value}</dd>
            </div>
          ))}
        </dl>
      ),
    });
  }

  if (product.stones.length > 0) {
    accordions.push({
      key: "stone",
      title: "Stone",
      content: (
        <div style={{ lineHeight: 1.6, color: "var(--md-fg-secondary)" }}>
          {product.stones.map((s, idx) => (
            <div key={idx}>
              <Link
                href={`${prefix}/stones/${s.slug}`}
                style={{ color: "var(--md-fg)", textDecoration: "underline" }}
              >
                {s.name}
              </Link>
              {s.cut ? ` · ${s.cut} cut` : ""}
              {s.caratWeight ? ` · ${s.caratWeight} ct` : ""}
            </div>
          ))}
        </div>
      ),
    });
  }

  if (careText) {
    accordions.push({
      key: "care",
      title: "Care",
      content: <div style={{ lineHeight: 1.6, color: "var(--md-fg-secondary)" }}>{careText}</div>,
    });
  }

  return (
    <div
      className="md-pdp-info"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--md-space-6)",
        position: "sticky",
        top: "var(--md-space-8, 32px)",
      }}
    >
      {/* Category / Collection Eyebrow */}
      {product.primaryCategoryName && (
        <div
          style={{
            fontSize: "var(--md-t-label, 0.75rem)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--md-fg-secondary)",
          }}
        >
          {product.primaryCategorySlug ? (
            <Link
              href={`${prefix}/${product.primaryCategorySlug}`}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {product.primaryCategoryName}
            </Link>
          ) : (
            product.primaryCategoryName
          )}
        </div>
      )}

      {/* Product Title */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--md-t-title, 2rem)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            color: "var(--md-fg)",
          }}
        >
          {product.title}
        </h1>
        {product.subtitle && (
          <p style={{ margin: "var(--md-space-1) 0 0 0", color: "var(--md-fg-secondary)", fontSize: "1rem" }}>
            {product.subtitle}
          </p>
        )}
      </div>

      {/* Price */}
      <div style={{ fontSize: "1.25rem", fontWeight: 400 }}>
        <PriceDisplay price={selectedVariant?.price} locale={locale} />
      </div>

      {/* Stone & Material line */}
      {stoneAndMaterial && (
        <div style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)" }}>
          {stoneAndMaterial}
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--md-rule)", margin: 0 }} />

      {/* Variant Selector with optional Size Guide */}
      <div>
        {isRing && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
            <button
              type="button"
              onClick={() => setIsSizeGuideOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--md-fg-secondary)",
                fontSize: "0.6875rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
                padding: "2px 0",
                textDecoration: "underline",
                textUnderlineOffset: "4px",
                fontWeight: 600,
              }}
            >
              Ring Sizing Guide
            </button>
          </div>
        )}
        <VariantSelector
          product={product}
          selectedVariant={selectedVariant}
          onSelectVariant={setSelectedVariant}
        />
      </div>

      {/* Availability hint */}
      <div>
        <AvailabilityBadge
          band={isSold ? "sold" : initialBand}
          leadTimeDays={product.leadTimeDays}
        />
      </div>

      <AddToBag
        productId={product.id}
        variantId={selectedVariant?.id ?? null}
        marketCode={marketCode}
        availabilityBand={isSold ? "sold" : initialBand}
        isSold={isSold}
        unavailableReason={product.unavailableReason}
        isPriced={selectedVariant?.price !== null}
      />

      {/* Atelier Specifications & Assurance */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          paddingBlock: "var(--md-space-4)",
          borderTop: "1px solid var(--md-rule)",
          fontSize: "0.75rem",
          letterSpacing: "0.06em",
          color: "var(--md-fg-secondary)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.6875rem" }}>Material</span>
          <span style={{ color: "var(--md-fg)", fontWeight: 500 }}>Anti-Tarnish 925 Sterling Silver</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.6875rem" }}>Provenance</span>
          <span style={{ color: "var(--md-fg)", fontWeight: 500 }}>Jaipur Atelier · In-House Bench (Est. 1961)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.6875rem" }}>Bespoke Sizing</span>
          <a
            href={whatsappInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--md-fg)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}
          >
            WhatsApp Atelier Concierge
          </a>
        </div>
      </div>

      <RingSizeGuideModal
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
      />

      <hr style={{ border: "none", borderTop: "1px solid var(--md-rule)", margin: "var(--md-space-3) 0 0 0" }} />

      {/* Accordions: Story · Details · Material · Stone · Care */}
      {accordions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {accordions.map((acc) => {
            const isOpen = Boolean(openAccordions[acc.key]);
            return (
              <div
                key={acc.key}
                style={{
                  borderBottom: "1px solid var(--md-rule)",
                  paddingBlock: "var(--md-space-3)",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(acc.key)}
                  aria-expanded={isOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "var(--md-t-label, 0.75rem)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--md-fg)",
                    fontWeight: 500,
                  }}
                >
                  <span>{acc.title}</span>
                  <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div style={{ paddingTop: "var(--md-space-3)", fontSize: "0.9375rem" }}>
                    {acc.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
