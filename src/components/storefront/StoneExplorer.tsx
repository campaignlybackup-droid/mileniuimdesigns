import type { JSX } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/media/url";
import { getStoneImage } from "@/lib/media/categoryImages";
import type { StoneRecord, StoneCategoryLink } from "@/lib/stones";

export type StoneExplorerProps = {
  stone: StoneRecord;
  categories: StoneCategoryLink[];
  activeCategorySlug?: string | null;
  marketSegment?: string;
  className?: string;
};

export function StoneExplorer({
  stone,
  categories,
  activeCategorySlug,
  marketSegment = "",
  className,
}: StoneExplorerProps): JSX.Element {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const heroUrl =
    (stone.heroPublicId
      ? imageUrl(stone.heroPublicId, { width: 1280, crop: "fill" })
      : null) ?? getStoneImage(stone.slug);

  let descriptionText = "";
  if (typeof stone.descriptionJson === "string") {
    descriptionText = stone.descriptionJson;
  } else if (stone.shortDescription) {
    descriptionText = stone.shortDescription;
  }

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--md-space-8)",
        width: "100%",
      }}
    >
      {/* Stone Header & Characteristics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: "var(--md-space-8)",
          alignItems: "center",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "var(--md-t-label, 0.75rem)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--md-fg-secondary)",
              fontWeight: 500,
            }}
          >
            The Stone
          </span>
          <h1
            style={{
              margin: "var(--md-space-2) 0 0 0",
              fontFamily: "var(--md-font-display)",
              fontSize: "var(--md-t-display, 2.5rem)",
              fontWeight: 400,
              lineHeight: 1.15,
            }}
          >
            {stone.name}
          </h1>

          {descriptionText && (
            <p
              style={{
                marginTop: "var(--md-space-4)",
                fontSize: "1.125rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.6,
                maxWidth: "50ch",
              }}
            >
              {descriptionText}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--md-space-6)",
              marginTop: "var(--md-space-6)",
              paddingTop: "var(--md-space-4)",
              borderTop: "1px solid var(--md-rule)",
              fontSize: "0.875rem",
            }}
          >
            {stone.hardnessMohs && (
              <div>
                <span style={{ color: "var(--md-fg-secondary)", display: "block" }}>Mohs Hardness</span>
                <span style={{ fontWeight: 500 }}>{stone.hardnessMohs}</span>
              </div>
            )}
            {stone.isLabGrown && (
              <div>
                <span style={{ color: "var(--md-fg-secondary)", display: "block" }}>Origin</span>
                <span style={{ fontWeight: 500 }}>Lab-grown</span>
              </div>
            )}
          </div>
        </div>

        {heroUrl && (
          <div
            style={{
              aspectRatio: "16 / 10",
              background: "var(--md-bg-raised)",
              borderRadius: "var(--md-radius-sm)",
              overflow: "hidden",
            }}
          >
            <img
              src={heroUrl}
              alt={stone.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
      </div>

      {/* Jewellery type tabs */}
      {categories.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--md-space-3)",
            borderBottom: "1px solid var(--md-rule)",
            paddingBottom: "var(--md-space-1)",
            overflowX: "auto",
          }}
        >
          <Link
            href={`${prefix}/stones/${stone.slug}`}
            style={{
              padding: "var(--md-space-2) var(--md-space-3)",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              fontSize: "var(--md-t-label, 0.75rem)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textDecoration: "none",
              color: !activeCategorySlug ? "var(--md-fg)" : "var(--md-fg-secondary)",
              borderBottom: !activeCategorySlug ? "2px solid var(--md-fg)" : "2px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            All Pieces
          </Link>

          {categories.map((c) => {
            const isActive = activeCategorySlug === c.slug;
            return (
              <Link
                key={c.id}
                href={`${prefix}/stones/${stone.slug}/${c.slug}`}
                style={{
                  padding: "var(--md-space-2) var(--md-space-3)",
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: "var(--md-t-label, 0.75rem)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  color: isActive ? "var(--md-fg)" : "var(--md-fg-secondary)",
                  borderBottom: isActive ? "2px solid var(--md-fg)" : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name} ({c.productCount})
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
