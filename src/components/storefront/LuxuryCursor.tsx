"use client";

import React, { useEffect, useState } from "react";

/**
 * LuxuryCursor — Bespoke desktop cursor for Millennium Designs fine jewellery.
 *
 * Implements high-fashion cursor physics with a gold micro-dot and trailing
 * magnetic outer ring that expands over interactives and displays contextual tags.
 * Silently bypassed on touch devices for maximum performance and native gesture feel.
 */
export function LuxuryCursor(): React.ReactElement | null {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [targetPos, setTargetPos] = useState({ x: -100, y: -100 });
  const [isHovered, setIsHovered] = useState(false);
  const [isCanvas, setIsCanvas] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTouch, setIsTouch] = useState(true);

  useEffect(() => {
    // Only run on fine-pointer desktop devices
    if (typeof window === "undefined") return;
    if (window.matchMedia && !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    requestAnimationFrame(() => {
      setIsTouch(false);
    });

    let currentX = -100;
    let currentY = -100;
    let targetX = -100;
    let targetY = -100;
    let animId: number;

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      setTargetPos({ x: targetX, y: targetY });
      if (!isVisible) setIsVisible(true);

      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(
          target.closest("a") ||
          target.closest("button") ||
          target.closest("[role='button']") ||
          target.closest("input") ||
          target.closest("select")
        );
        const isCanvasEl = Boolean(target.closest("canvas"));

        setIsHovered(isInteractive);
        setIsCanvas(isCanvasEl);
      }
    };

    const onMouseLeave = () => {
      setIsVisible(false);
    };

    const onMouseEnter = () => {
      setIsVisible(true);
    };

    // Smooth lerp loop for the outer trailing ring
    const loop = () => {
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      setPos({ x: currentX, y: currentY });
      animId = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
    };
  }, [isVisible]);

  if (isTouch || !isVisible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {/* Center Micro-Dot */}
      <div
        style={{
          position: "fixed",
          top: targetPos.y,
          left: targetPos.x,
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: "var(--md-champagne)",
          transform: "translate(-50%, -50%)",
          transition: "opacity 150ms ease",
          boxShadow: "0 0 6px var(--md-champagne)",
        }}
      />

      {/* Trailing Outer Ring */}
      <div
        style={{
          position: "fixed",
          top: pos.y,
          left: pos.x,
          width: isCanvas ? 84 : isHovered ? 48 : 28,
          height: isCanvas ? 32 : isHovered ? 48 : 28,
          borderRadius: isCanvas ? "var(--md-radius-pill)" : "50%",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 75%, transparent)",
          backgroundColor: isCanvas
            ? "rgba(6, 19, 13, 0.85)"
            : isHovered
              ? "color-mix(in srgb, var(--md-champagne) 12%, transparent)"
              : "transparent",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "width 220ms ease, height 220ms ease, border-radius 220ms ease, background-color 220ms ease",
          backdropFilter: isCanvas ? "blur(4px)" : "none",
        }}
      >
        {isCanvas && (
          <span
            style={{
              fontSize: "0.5625rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
              fontFamily: "var(--md-font-crest), Georgia, serif",
              lineHeight: 1,
            }}
          >
            360° DRAG
          </span>
        )}
      </div>
    </div>
  );
}
