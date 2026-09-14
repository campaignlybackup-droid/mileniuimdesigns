import type { JSX } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/media/url";
import { getStoneImage } from "@/lib/media/categoryImages";
import type { StoneRecord } from "@/lib/stones";

export type StoneCardProps = {
  stone: StoneRecord;
  marketSegment?: string;
  className?: string;
};

export function StoneCard({
  stone,
  marketSegment = "",
  className,
}: StoneCardProps): JSX.Element {
  const prefix = marketSegment === "" ? "" : `/${marketSegment}`;
  const href = `${prefix}/stones/${stone.slug}`;

  const imgUrl = stone.heroPublicId
    ? (imageUrl(stone.heroPublicId, { width: 640, crop: "fill" }) ?? getStoneImage(stone.slug))
    : getStoneImage(stone.slug);


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
        border: "1px solid var(--md-rule)",
        borderRadius: "4px",
        overflow: "hidden",
        padding: "var(--md-space-3)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "var(--md-bg)",
          overflow: "hidden",
          position: "relative",
          borderRadius: "2px",
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

      <div style={{ paddingTop: "var(--md-space-3)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "0.875rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--md-fg)",
          }}
        >
          {stone.name}
        </h3>
        <span
          style={{
            marginTop: "var(--md-space-1)",
            fontSize: "0.6875rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--md-green)",
            fontWeight: 500,
          }}
        >
          View Collection →
        </span>
      </div>
    </Link>
  );
}
