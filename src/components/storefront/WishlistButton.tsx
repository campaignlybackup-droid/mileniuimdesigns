"use client";

import { useSyncExternalStore, type JSX } from "react";

function subscribeToWishlist(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("md_wishlist_change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("md_wishlist_change", callback);
  };
}

function getWishlistSnapshot(): string {
  try {
    return localStorage.getItem("md_wishlist") ?? "[]";
  } catch {
    return "[]";
  }
}

function getWishlistServerSnapshot(): string {
  return "[]";
}

export type WishlistButtonProps = {
  productId: string;
  variantId?: string;
  className?: string;
  size?: "sm" | "md";
};

export function WishlistButton({
  productId,
  className,
  size = "sm",
}: WishlistButtonProps): JSX.Element {
  const rawList = useSyncExternalStore(
    subscribeToWishlist,
    getWishlistSnapshot,
    getWishlistServerSnapshot,
  );

  let isSaved = false;
  try {
    const list = JSON.parse(rawList) as string[];
    isSaved = Array.isArray(list) && list.includes(productId);
  } catch {
    isSaved = false;
  }

  const toggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const savedList = JSON.parse(localStorage.getItem("md_wishlist") ?? "[]") as string[];
      let updated: string[];
      if (savedList.includes(productId)) {
        updated = savedList.filter((id) => id !== productId);
      } else {
        updated = [...savedList, productId];
      }
      localStorage.setItem("md_wishlist", JSON.stringify(updated));
      window.dispatchEvent(new Event("md_wishlist_change"));
    } catch {
      // Storage unavailable
    }
  };


  return (
    <button
      type="button"
      onClick={toggleWishlist}
      aria-label={isSaved ? "Remove from saved pieces" : "Save to wishlist"}
      className={className}
      style={{
        background: "transparent",
        border: "none",
        padding: "var(--md-space-2)",
        cursor: "pointer",
        color: isSaved ? "var(--md-emerald, var(--md-fg))" : "var(--md-fg-muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color var(--md-dur-fast) ease",
      }}
    >
      <HeartIcon filled={isSaved} size={size === "sm" ? 18 : 22} />
    </button>
  );

}

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
