import type { JSX } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/media/url";
import { getStoneImage } from "@/lib/media/categoryImages";
import type { StoneRecord } from "@/lib/stones";

export type StoneCardProps = {
  stone: StoneRecord;
  marketSegment?: string;
  className?: string;
  variant?: "featured" | "wide" | "standard";
};

export function StoneCard({
  stone,
  marketSegment = "",
  className,
  variant = "standard",
}: StoneCardProps): JSX.Element {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const href = `${prefix}/stones/${stone.slug}`;

  const isFeatured = variant === "featured";
  const isWide = variant === "wide";

  const imgUrl = stone.heroPublicId
    ? (imageUrl(stone.heroPublicId, {
        width: isFeatured ? 1024 : 640,
        crop: "fill",
      }) ?? getStoneImage(stone.slug))
    : getStoneImage(stone.slug);

  const aspectRatio = isFeatured ? "16 / 10" : isWide ? "16 / 10" : "1 / 1";

  return (
    <Link
      href={href}
      className={`md-stone-card ${className ?? ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        position: "relative",
        background: "var(--md-bg-raised)",
        borderRadius: "var(--md-radius-sm)",
        border: "1px solid color-mix(in srgb, var(--md-champagne) 20%, transparent)",
        overflow: "hidden",
        padding: isFeatured ? "clamp(12px, 2.5vw, 20px)" : "clamp(8px, 2vw, 14px)",
        textAlign: isFeatured ? "left" : "center",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio,
          background: "var(--md-bg)",
          overflow: "hidden",
          position: "relative",
          borderRadius: "var(--md-radius-sm)",
        }}
      >
        <img
          src={imgUrl}
          alt={stone.name}
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform var(--md-dur, 320ms) var(--md-ease)",
          }}
        />
      </div>

      <div
        style={{
          paddingTop: isFeatured ? "clamp(8px, 1.8vw, 16px)" : "clamp(6px, 1.4vw, 12px)",
          display: "flex",
          flexDirection: "column",
          alignItems: isFeatured ? "flex-start" : "center",
          flex: 1,
          justifyContent: "space-between",
        }}
      >
        <div>
          {isFeatured && (
            <span
              style={{
                fontSize: "var(--md-t-label, 0.6875rem)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--md-green)",
                fontWeight: 600,
                display: "block",
                marginBottom: "var(--md-space-1)",
              }}
            >
              Signature Gemstone
            </span>
          )}

          <h3
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: isFeatured ? "clamp(1.25rem, 2.4vw, 2rem)" : isWide ? "clamp(1rem, 2vw, 1.25rem)" : "clamp(0.875rem, 2vw, 1.0625rem)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--md-fg)",
              lineHeight: 1.2,
              minHeight: "1.4em",
              display: "flex",
              alignItems: "center",
              justifyContent: isFeatured ? "flex-start" : "center",
            }}
          >
            {stone.name}
          </h3>

          {isFeatured && stone.shortDescription && (
            <p
              style={{
                margin: "var(--md-space-2) 0 0 0",
                fontSize: "0.875rem",
                color: "var(--md-fg-secondary)",
                lineHeight: 1.5,
                maxWidth: "48ch",
              }}
            >
              {stone.shortDescription}
            </p>
          )}

          {isFeatured && stone.hardnessMohs && (
            <div
              style={{
                display: "inline-flex",
                gap: "var(--md-space-3)",
                marginTop: "var(--md-space-2)",
                fontSize: "0.75rem",
                color: "var(--md-fg-secondary)",
              }}
            >
              <span>Mohs Hardness: <strong>{stone.hardnessMohs}</strong></span>
              {stone.isLabGrown && <span>• Lab-grown</span>}
            </div>
          )}
        </div>

        <span
          style={{
            marginTop: "auto",
            paddingTop: "clamp(6px, 1.5vw, 12px)",
            fontSize: "clamp(0.625rem, 1.4vw, 0.6875rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--md-green)",
            fontWeight: 600,
          }}
        >
          {isFeatured ? "Explore Stone & Collections →" : "View Collection →"}
        </span>
      </div>
    </Link>
  );
}
