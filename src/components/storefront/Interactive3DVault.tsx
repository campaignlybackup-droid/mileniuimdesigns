"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";

type GemstoneSpecimen = {
  id: string;
  name: string;
  subhead: string;
  carat: string;
  origin: string;
  cut: string;
  refractiveIndex: string;
  mohs: string;
  baseColor: [number, number, number];
  accentColor: [number, number, number];
  description: string;
  targetHref: string;
};

const SPECIMENS: GemstoneSpecimen[] = [
  {
    id: "emerald",
    name: "The Sovereign Colombian Emerald",
    subhead: "OCTAGONAL STEP-CUT SOLITAIRE",
    carat: "4.25 Carats",
    origin: "Muzo Mine / Cut in Johari Jaipur",
    cut: "Ancestral Step-Cut, 58 Facets",
    refractiveIndex: "1.577 – 1.583",
    mohs: "7.5 – 8.0",
    baseColor: [0, 168, 80],
    accentColor: [100, 240, 160],
    description: "Deep crystalline garden inclusions (‘jardin’) celebrated in Rajput courts. Hand-polished on oil-fed wooden laps in Johari Bazaar to awaken deep green velvety fire.",
    targetHref: "/rings",
  },
  {
    id: "sapphire",
    name: "The Royal Kashmir Blue Sapphire",
    subhead: "CUSHION BRILLIANT ARCHIVAL MOUNT",
    carat: "3.90 Carats",
    origin: "High Himalayas / Jaipur Recut",
    cut: "Modified Cushion Crown, 66 Facets",
    refractiveIndex: "1.762 – 1.770",
    mohs: "9.0",
    baseColor: [15, 60, 180],
    accentColor: [110, 175, 255],
    description: "Cornflower velvety saturation with unheated celestial luminescence. Forged in 925 silver with dual platinum micro-prongs.",
    targetHref: "/pendants",
  },
  {
    id: "ruby",
    name: "The Maharani Pigeon Blood Ruby",
    subhead: "OVAL BRILLIANT COURT HEIRLOOM",
    carat: "4.60 Carats",
    origin: "Mogok Valley / Jaipur Royal Archive",
    cut: "Oval Brilliant Faceting, 72 Facets",
    refractiveIndex: "1.766 – 1.774",
    mohs: "9.0",
    baseColor: [195, 20, 50],
    accentColor: [255, 110, 130],
    description: "Fluorescent crimson scarlet hue exhibiting natural silk asterism under direct sunlight. Hand-cast in anti-tarnish sovereign 925 silver.",
    targetHref: "/earrings",
  },
];

type MetalFinish = "gold" | "platinum" | "rosegold";

export function Interactive3DVault({ marketPrefix = "" }: { marketPrefix?: string }): React.JSX.Element {
  const [activeSpecimen, setActiveSpecimen] = useState<GemstoneSpecimen>(SPECIMENS[0]);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [metal, setMetal] = useState<MetalFinish>("gold");
  const [isRotating, setIsRotating] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    let rotY = 0.4;
    let rotX = 0.25;
    let targetRotY = 0.4;
    let targetRotX = 0.25;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = (e.clientX - lastX) * 0.01;
      const dy = (e.clientY - lastY) * 0.01;
      targetRotY += dx;
      targetRotX += dy;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = (e.touches[0].clientX - lastX) * 0.012;
      const dy = (e.touches[0].clientY - lastY) * 0.012;
      targetRotY += dx;
      targetRotX += dy;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseUp);

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = rect?.width || 500;
      height = rect?.height || 500;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // 3D Gemstone Geometry Model (Octagonal Step-Cut & Brilliant Pavilion)
    const tableVertices = [
      [-0.45, -0.65, 0.45],
      [0.45, -0.65, 0.45],
      [0.65, -0.45, 0.45],
      [0.65, 0.45, 0.45],
      [0.45, 0.65, 0.45],
      [-0.45, 0.65, 0.45],
      [-0.65, 0.45, 0.45],
      [-0.65, -0.45, 0.45],
    ];

    const girdleVertices = [
      [-0.75, -1.05, 0.12],
      [0.75, -1.05, 0.12],
      [1.05, -0.75, 0.12],
      [1.05, 0.75, 0.12],
      [0.75, 1.05, 0.12],
      [-0.75, 1.05, 0.12],
      [-1.05, 0.75, 0.12],
      [-1.05, -0.75, 0.12],
    ];

    const culetVertices = [
      [-0.15, -0.3, -0.6],
      [0.15, -0.3, -0.6],
      [0.15, 0.3, -0.6],
      [-0.15, 0.3, -0.6],
    ];

    const project = (x: number, y: number, z: number, scale: number) => {
      // Rotation Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY - z * sinY;
      const z1 = z * cosY + x * sinY;

      // Rotation X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y * cosX - z1 * sinX;
      const z2 = z1 * cosX + y * sinX;

      // Perspective
      const fov = 3.2;
      const p = fov / (fov + z2);
      const px = width / 2 + x1 * scale * p;
      const py = height / 2 + y2 * scale * p;

      return { x: px, y: py, z: z2 };
    };

    let tick = 0;

    const render = () => {
      tick++;
      if (isRotating && !isDragging) {
        targetRotY += 0.006;
      }
      rotY += (targetRotY - rotY) * 0.1;
      rotX += (targetRotX - rotX) * 0.1;

      ctx.clearRect(0, 0, width, height);

      const scale = Math.min(width, height) * 0.36;

      // Draw Caustic Floor Glow
      const causticGrad = ctx.createRadialGradient(
        width / 2,
        height / 2 + scale * 0.7,
        0,
        width / 2,
        height / 2 + scale * 0.7,
        scale * 1.1
      );
      const [r, g, b] = activeSpecimen.baseColor;
      causticGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.22)`);
      causticGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
      causticGrad.addColorStop(1, "transparent");

      ctx.fillStyle = causticGrad;
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2 + scale * 0.7, scale * 0.9, scale * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Project table, girdle, and culet points
      const pTable = tableVertices.map((v) => project(v[0], v[1], v[2], scale));
      const pGirdle = girdleVertices.map((v) => project(v[0], v[1], v[2], scale));
      const pCulet = culetVertices.map((v) => project(v[0], v[1], v[2], scale));

      const [ar, ag, ab] = activeSpecimen.accentColor;

      if (wireframeMode) {
        // CAD Wireframe Raytracing Mode
        ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.75)`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = `rgb(${ar}, ${ag}, ${ab})`;
        ctx.shadowBlur = 8;

        // Table loop
        ctx.beginPath();
        pTable.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.stroke();

        // Girdle loop
        ctx.beginPath();
        pGirdle.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.stroke();

        // Culet loop
        ctx.beginPath();
        pCulet.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.stroke();

        // Crown ribs (table to girdle)
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo(pTable[i].x, pTable[i].y);
          ctx.lineTo(pGirdle[i].x, pGirdle[i].y);
          ctx.stroke();
        }

        // Pavilion ribs (girdle to culet)
        for (let i = 0; i < 8; i++) {
          const culetPt = pCulet[Math.floor(i / 2)];
          ctx.beginPath();
          ctx.moveTo(pGirdle[i].x, pGirdle[i].y);
          ctx.lineTo(culetPt.x, culetPt.y);
          ctx.stroke();
        }

        // Draw glowing vertex nodes
        [...pTable, ...pGirdle, ...pCulet].forEach((pt) => {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.shadowBlur = 0;
      } else {
        // Photorealistic Facet Shading Mode
        // Crown Facets
        for (let i = 0; i < 8; i++) {
          const next = (i + 1) % 8;
          const avgZ = (pTable[i].z + pTable[next].z + pGirdle[next].z + pGirdle[i].z) / 4;
          const alpha = 0.55 + avgZ * 0.35;
          const shimmer = Math.sin(tick * 0.05 + i) * 0.15;

          ctx.beginPath();
          ctx.moveTo(pTable[i].x, pTable[i].y);
          ctx.lineTo(pTable[next].x, pTable[next].y);
          ctx.lineTo(pGirdle[next].x, pGirdle[next].y);
          ctx.lineTo(pGirdle[i].x, pGirdle[i].y);
          ctx.closePath();

          ctx.fillStyle = `rgba(${r + shimmer * 40}, ${g + shimmer * 30}, ${b + shimmer * 20}, ${Math.max(0.2, alpha)})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.4)`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Table facet
        ctx.beginPath();
        pTable.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();
        ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, 0.65)`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Specular glint
        const glintIdx = Math.floor((tick * 0.02) % 8);
        const glintPt = pTable[glintIdx];
        if (glintPt) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.shadowColor = "#ffffff";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(glintPt.x, glintPt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("touchstart", handleTouchStart);
    };
  }, [activeSpecimen, wireframeMode, isRotating]);

  const prefix = marketPrefix === "" ? "" : `/${marketPrefix}`;

  return (
    <section
      data-surface="emerald-deep"
      style={{
        position: "relative",
        background: "var(--md-green-black)",
        color: "var(--md-fg-inverse)",
        paddingBlock: "clamp(64px, 8vw, 110px)",
        overflow: "hidden",
        borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
        borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
      }}
    >
      {/* Background Stardust & Radial Luster */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--md-champagne) 12%, transparent) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
          paddingInline: "var(--md-gutter)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Header Eyebrow & Title */}
        <div style={{ textAlign: "center", maxWidth: "780px", marginInline: "auto", marginBottom: "clamp(32px, 5vw, 56px)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 14px",
              borderRadius: "2px",
              background: "color-mix(in srgb, var(--md-champagne) 14%, transparent)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 38%, transparent)",
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontFamily: "var(--md-font-crest), Georgia, serif",
              marginBottom: "var(--md-space-3)",
            }}
          >
            <span>✦ 3D GEMOLOGICAL INSPECTION VAULT ✦</span>
          </div>

          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.85rem, 3.5vw, 3rem)",
              fontWeight: 400,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: "var(--md-fg-inverse)",
            }}
          >
            Inspect Every Facet in Sovereign 3D.
          </h2>

          <p
            style={{
              margin: "var(--md-space-3) auto 0",
              fontSize: "clamp(0.9375rem, 1.3vw, 1.0625rem)",
              lineHeight: 1.65,
              color: "var(--md-fg-inverse-muted)",
              maxWidth: "600px",
            }}
          >
            Rotate 360°, trace refractive dispersion lines, and examine our signature Johari lapidary cuts before acquiring your heirloom.
          </p>
        </div>

        {/* 3D Stage & Interactive Console Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "clamp(24px, 4vw, 48px)",
            alignItems: "center",
            background: "color-mix(in srgb, var(--md-forest) 55%, transparent)",
            borderRadius: "var(--md-radius-sm)",
            border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
            padding: "clamp(20px, 4vw, 40px)",
            boxShadow: "0 24px 60px -20px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Left / Center: 3D Interactive Canvas */}
          <div
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              maxWidth: "520px",
              width: "100%",
              marginInline: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
            }}
          >
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

            {/* 3D Floating Mode Indicators */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "0.625rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "3px 8px",
                  borderRadius: "2px",
                  background: "rgba(0, 0, 0, 0.65)",
                  border: "1px solid rgba(200, 178, 122, 0.3)",
                  color: "var(--md-champagne)",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                ✦ 360° Real-time 3D CAD
              </span>
              <span
                style={{
                  fontSize: "0.5625rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--md-fg-inverse-muted)",
                }}
              >
                DRAG OR SWIPE TO ROTATE
              </span>
            </div>

            {/* Canvas Bottom Action Controls */}
            <div
              style={{
                position: "absolute",
                bottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(6, 19, 13, 0.75)",
                backdropFilter: "blur(8px)",
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid rgba(200, 178, 122, 0.25)",
              }}
            >
              <button
                type="button"
                onClick={() => setWireframeMode(!wireframeMode)}
                style={{
                  background: wireframeMode ? "var(--md-champagne)" : "transparent",
                  color: wireframeMode ? "var(--md-green-black)" : "var(--md-fg-inverse)",
                  border: "none",
                  borderRadius: "14px",
                  padding: "4px 10px",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                }}
              >
                {wireframeMode ? "CAD Wireframe: ON" : "CAD Wireframe"}
              </button>

              <button
                type="button"
                onClick={() => setIsRotating(!isRotating)}
                style={{
                  background: "transparent",
                  color: "var(--md-champagne)",
                  border: "none",
                  padding: "4px 8px",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {isRotating ? "Pause Orbit" : "Auto Orbit"}
              </button>
            </div>
          </div>

          {/* Right: Gemological Specification & Acquisition Console */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Gemstone Selection Pills */}
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  marginBottom: "8px",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                SELECT GEMSTONE SPECIMEN:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {SPECIMENS.map((spec) => {
                  const isActive = activeSpecimen.id === spec.id;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => setActiveSpecimen(spec)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "2px",
                        border: isActive
                          ? "1px solid var(--md-champagne)"
                          : "1px solid color-mix(in srgb, var(--md-fg-inverse) 18%, transparent)",
                        background: isActive
                          ? "color-mix(in srgb, var(--md-champagne) 18%, transparent)"
                          : "rgba(6, 19, 13, 0.4)",
                        color: isActive ? "var(--md-champagne)" : "var(--md-fg-inverse-muted)",
                        fontSize: "0.75rem",
                        letterSpacing: "0.08em",
                        fontWeight: isActive ? 600 : 400,
                        cursor: "pointer",
                        transition: "all 160ms ease",
                      }}
                    >
                      {spec.name.replace("The ", "")}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Specimen Meta Header */}
            <div style={{ borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 18%, transparent)", paddingBottom: "16px" }}>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                {activeSpecimen.subhead}
              </span>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.25rem, 2.2vw, 1.75rem)",
                  fontWeight: 400,
                  lineHeight: 1.25,
                  color: "var(--md-fg-inverse)",
                }}
              >
                {activeSpecimen.name}
              </h3>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "0.875rem",
                  lineHeight: 1.6,
                  color: "var(--md-fg-inverse-muted)",
                }}
              >
                {activeSpecimen.description}
              </p>
            </div>

            {/* Live Gemological Specs Matrix */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
                background: "rgba(0, 0, 0, 0.25)",
                padding: "14px",
                borderRadius: "2px",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 14%, transparent)",
              }}
            >
              <div>
                <span style={{ display: "block", fontSize: "0.625rem", color: "var(--md-fg-inverse-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Carat Weight
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.carat}
                </span>
              </div>

              <div>
                <span style={{ display: "block", fontSize: "0.625rem", color: "var(--md-fg-inverse-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Lapidary Faceting
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.cut}
                </span>
              </div>

              <div>
                <span style={{ display: "block", fontSize: "0.625rem", color: "var(--md-fg-inverse-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Refractive Index
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--md-champagne)" }}>
                  {activeSpecimen.refractiveIndex}
                </span>
              </div>

              <div>
                <span style={{ display: "block", fontSize: "0.625rem", color: "var(--md-fg-inverse-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Mohs Hardness
                </span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.mohs}
                </span>
              </div>
            </div>

            {/* Metal Mount Selector */}
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  marginBottom: "8px",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                AVAILABLE FORGED SETTINGS:
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                {[
                  { id: "gold", label: "18K Royal Yellow Gold" },
                  { id: "platinum", label: "950 Sovereign Platinum" },
                  { id: "rosegold", label: "Pink Rose Gold" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetal(m.id as MetalFinish)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "2px",
                      border: metal === m.id ? "1px solid var(--md-champagne)" : "1px solid rgba(255,255,255,0.12)",
                      background: metal === m.id ? "color-mix(in srgb, var(--md-champagne) 20%, transparent)" : "transparent",
                      color: metal === m.id ? "var(--md-champagne)" : "var(--md-fg-inverse-muted)",
                      fontSize: "0.6875rem",
                      cursor: "pointer",
                      transition: "all 140ms ease",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Direct e-commerce acquisition CTAs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", paddingTop: "8px" }}>
              <Link
                href={`${prefix}${activeSpecimen.targetHref}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "14px 28px",
                  background: "var(--md-champagne)",
                  color: "var(--md-green-black)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  boxShadow: "0 8px 24px -6px rgba(200, 178, 122, 0.4)",
                }}
              >
                Acquire Atelier Masterpiece →
              </Link>

              <Link
                href={`${prefix}/our-story`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "14px 20px",
                  border: "1px solid color-mix(in srgb, var(--md-fg-inverse) 30%, transparent)",
                  color: "var(--md-fg-inverse)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm)",
                  transition: "background 180ms ease",
                }}
              >
                Our 1961 Lapidary Heritage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
