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
    origin: "Muzo Valley / Jaipur Lapidary",
    cut: "Ancestral Step-Cut · 58 Facets",
    refractiveIndex: "1.577 – 1.583",
    mohs: "7.5 – 8.0",
    baseColor: [0, 168, 80],
    accentColor: [100, 240, 160],
    description:
      "Deep crystalline garden inclusions (‘jardin’) celebrated in Rajput courts. Hand-polished on oil-fed wooden laps in Johari Bazaar to awaken deep green velvety fire.",
    targetHref: "/rings",
  },
  {
    id: "sapphire",
    name: "The Royal Kashmir Blue Sapphire",
    subhead: "CUSHION BRILLIANT ARCHIVAL MOUNT",
    carat: "3.90 Carats",
    origin: "High Himalayas / Jaipur Recut",
    cut: "Modified Cushion Crown · 66 Facets",
    refractiveIndex: "1.762 – 1.770",
    mohs: "9.0",
    baseColor: [15, 60, 180],
    accentColor: [110, 175, 255],
    description:
      "Cornflower velvety saturation with unheated celestial luminescence. Forged in 925 silver with dual platinum micro-prongs.",
    targetHref: "/pendants",
  },
  {
    id: "ruby",
    name: "The Maharani Pigeon Blood Ruby",
    subhead: "OVAL BRILLIANT COURT HEIRLOOM",
    carat: "4.60 Carats",
    origin: "Mogok Valley / Jaipur Archive",
    cut: "Oval Brilliant Faceting · 72 Facets",
    refractiveIndex: "1.766 – 1.774",
    mohs: "9.0",
    baseColor: [195, 20, 50],
    accentColor: [255, 110, 130],
    description:
      "Fluorescent crimson scarlet hue exhibiting natural silk asterism under direct sunlight. Hand-cast in anti-tarnish sovereign 925 silver.",
    targetHref: "/earrings",
  },
];

type MetalFinish = "silver" | "gold" | "rosegold";

export function InteractiveStudio3D({ marketPrefix = "" }: { marketPrefix?: string }): React.JSX.Element {
  const [activeSpecimen, setActiveSpecimen] = useState<GemstoneSpecimen>(SPECIMENS[0]);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [metal, setMetal] = useState<MetalFinish>("silver");
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
      const z1 = -x * sinY + z * cosY;

      // Rotation X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      // Perspective
      const fov = 3.6;
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
          const culetIdx = Math.floor(i / 2);
          ctx.beginPath();
          ctx.moveTo(pGirdle[i].x, pGirdle[i].y);
          ctx.lineTo(pCulet[culetIdx].x, pCulet[culetIdx].y);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
      } else {
        // Faceted Refraction Shading Mode
        // 1. Pavilion under-facets
        for (let i = 0; i < 8; i++) {
          const next = (i + 1) % 8;
          const culetIdx = Math.floor(i / 2);
          const nextCuletIdx = Math.floor(next / 2);

          ctx.beginPath();
          ctx.moveTo(pGirdle[i].x, pGirdle[i].y);
          ctx.lineTo(pCulet[culetIdx].x, pCulet[culetIdx].y);
          ctx.lineTo(pCulet[nextCuletIdx].x, pCulet[nextCuletIdx].y);
          ctx.lineTo(pGirdle[next].x, pGirdle[next].y);
          ctx.closePath();

          const lightPulse = Math.abs(Math.sin(rotY * 1.5 + (i * Math.PI) / 4));
          ctx.fillStyle = `rgba(${Math.floor(r * 0.45)}, ${Math.floor(g * 0.45)}, ${Math.floor(b * 0.45)}, ${0.65 + lightPulse * 0.3})`;
          ctx.fill();
        }

        // 2. Crown upper facets
        for (let i = 0; i < 8; i++) {
          const next = (i + 1) % 8;
          ctx.beginPath();
          ctx.moveTo(pTable[i].x, pTable[i].y);
          ctx.lineTo(pGirdle[i].x, pGirdle[i].y);
          ctx.lineTo(pGirdle[next].x, pGirdle[next].y);
          ctx.lineTo(pTable[next].x, pTable[next].y);
          ctx.closePath();

          const crownLight = Math.abs(Math.cos(rotY + (i * Math.PI) / 4));
          ctx.fillStyle = `rgba(${Math.floor(r * 0.8 + ar * 0.2)}, ${Math.floor(g * 0.8 + ag * 0.2)}, ${Math.floor(b * 0.8 + ab * 0.2)}, ${0.5 + crownLight * 0.45})`;
          ctx.fill();

          ctx.strokeStyle = `rgba(240, 230, 200, 0.4)`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // 3. Table facet (top mirror plane)
        ctx.beginPath();
        pTable.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
        ctx.closePath();

        const tableGrad = ctx.createLinearGradient(pTable[0].x, pTable[0].y, pTable[4].x, pTable[4].y);
        tableGrad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.7)`);
        tableGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.88)`);
        tableGrad.addColorStop(1, `rgba(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)}, 0.95)`);
        ctx.fillStyle = tableGrad;
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 4. Metal Prongs Claws
      const prongColor =
        metal === "silver"
          ? "#e8ecef"
          : metal === "rosegold"
            ? "#e8b89e"
            : "#f4dc9e";

      pGirdle.forEach((pt, idx) => {
        if (idx % 2 === 0) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = prongColor;
          ctx.shadowColor = prongColor;
          ctx.shadowBlur = 6;
          ctx.fill();
        }
      });
      ctx.shadowBlur = 0;

      // 5. Specular Glint
      const sweepIndex = Math.floor((tick * 0.02) % 8);
      const glintPt = pTable[sweepIndex];
      if (glintPt && !wireframeMode) {
        const glint = ctx.createRadialGradient(glintPt.x, glintPt.y, 0, glintPt.x, glintPt.y, 24);
        glint.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        glint.addColorStop(0.4, `rgba(${ar}, ${ag}, ${ab}, 0.6)`);
        glint.addColorStop(1, "transparent");
        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(glintPt.x, glintPt.y, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeSpecimen, wireframeMode, metal, isRotating]);

  return (
    <section
      data-surface="forest"
      style={{
        background: "var(--md-forest)",
        color: "var(--md-fg-inverse)",
        paddingBlock: "clamp(64px, 8vw, 108px)",
        paddingInline: "var(--md-gutter)",
        borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 24%, var(--md-rule))",
        borderBottom: "1px solid color-mix(in srgb, var(--md-champagne) 24%, var(--md-rule))",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: "var(--md-container)",
          marginInline: "auto",
        }}
      >
        {/* Section Header */}
        <div style={{ textAlign: "center", marginBottom: "clamp(36px, 5vw, 64px)" }}>
          <span
            style={{
              fontSize: "0.6875rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--md-champagne)",
              fontWeight: 600,
              display: "inline-block",
              marginBottom: "var(--md-space-2)",
              fontFamily: "var(--md-font-sans), sans-serif",
            }}
          >
            ATELIER 3D INSPECTION · INTERACTIVE SHOWROOM
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(2rem, 3.8vw, 3.25rem)",
              fontWeight: 400,
              letterSpacing: "-0.015em",
              color: "var(--md-fg-inverse)",
              lineHeight: 1.15,
            }}
          >
            Inspect the House Gemstone Archives in 360°
          </h2>
          <p
            style={{
              maxWidth: 620,
              marginInline: "auto",
              marginTop: "var(--md-space-3)",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "color-mix(in srgb, var(--md-fg-inverse) 82%, transparent)",
            }}
          >
            Manipulate cut facets, toggle metal finishes, and examine natural optical light return directly from the
            Johari Bazaar bench.
          </p>
        </div>

        {/* Specimen Selector Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "clamp(8px, 2vw, 16px)",
            flexWrap: "wrap",
            marginBottom: "clamp(28px, 4vw, 44px)",
          }}
        >
          {SPECIMENS.map((spec) => {
            const isSelected = spec.id === activeSpecimen.id;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => setActiveSpecimen(spec)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "var(--md-radius-sm, 0px)",
                  background: isSelected
                    ? "color-mix(in srgb, var(--md-champagne) 20%, transparent)"
                    : "rgba(0, 0, 0, 0.25)",
                  border: isSelected
                    ? "1px solid var(--md-champagne)"
                    : "1px solid color-mix(in srgb, var(--md-champagne) 22%, transparent)",
                  color: isSelected ? "var(--md-champagne)" : "var(--md-fg-inverse)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 180ms ease",
                  fontFamily: "var(--md-font-crest), Georgia, serif",
                }}
              >
                ✦ {spec.name.replace("The Sovereign ", "").replace("The Royal ", "").replace("The Maharani ", "")}
              </button>
            );
          })}
        </div>

        {/* 3D Interactive Stage + Technical Specs Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "clamp(32px, 5vw, 64px)",
            alignItems: "center",
          }}
        >
          {/* Canvas & Controls Container */}
          <div
            style={{
              position: "relative",
              borderRadius: "var(--md-radius-sm, 0px)",
              background: "rgba(4, 16, 10, 0.55)",
              border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, transparent)",
              padding: "clamp(16px, 3vw, 32px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              boxShadow: "0 24px 48px -16px rgba(0, 0, 0, 0.4)",
            }}
          >
            {/* Canvas */}
            <div
              style={{
                width: "100%",
                maxWidth: 460,
                height: "clamp(340px, 46vw, 440px)",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: "block",
                  cursor: "grab",
                  touchAction: "none",
                }}
              />
            </div>

            {/* Interactive Mode Switches */}
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid color-mix(in srgb, var(--md-champagne) 18%, transparent)",
              }}
            >
              {/* Metal Setting Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: "0.625rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--md-champagne)",
                  }}
                >
                  Setting:
                </span>
                <button
                  type="button"
                  onClick={() => setMetal("silver")}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    borderRadius: 0,
                    background: metal === "silver" ? "var(--md-champagne)" : "transparent",
                    color: metal === "silver" ? "var(--md-green-black)" : "var(--md-fg-inverse)",
                    border: "1px solid var(--md-champagne)",
                    cursor: "pointer",
                  }}
                >
                  925 Silver
                </button>
                <button
                  type="button"
                  onClick={() => setMetal("gold")}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    borderRadius: 0,
                    background: metal === "gold" ? "var(--md-champagne)" : "transparent",
                    color: metal === "gold" ? "var(--md-green-black)" : "var(--md-fg-inverse)",
                    border: "1px solid var(--md-champagne)",
                    cursor: "pointer",
                  }}
                >
                  18K Gold
                </button>
                <button
                  type="button"
                  onClick={() => setMetal("rosegold")}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    borderRadius: 0,
                    background: metal === "rosegold" ? "var(--md-champagne)" : "transparent",
                    color: metal === "rosegold" ? "var(--md-green-black)" : "var(--md-fg-inverse)",
                    border: "1px solid var(--md-champagne)",
                    cursor: "pointer",
                  }}
                >
                  Rose
                </button>
              </div>

              {/* View Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setWireframeMode(!wireframeMode)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.625rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    borderRadius: 0,
                    background: wireframeMode ? "var(--md-champagne)" : "transparent",
                    color: wireframeMode ? "var(--md-green-black)" : "var(--md-fg-inverse)",
                    border: "1px solid var(--md-champagne)",
                    cursor: "pointer",
                  }}
                >
                  {wireframeMode ? "CAD Raytrace ON" : "Faceted Shading"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRotating(!isRotating)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.625rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    borderRadius: 0,
                    background: isRotating ? "color-mix(in srgb, var(--md-champagne) 20%, transparent)" : "transparent",
                    color: "var(--md-fg-inverse)",
                    border: "1px solid color-mix(in srgb, var(--md-champagne) 35%, transparent)",
                    cursor: "pointer",
                  }}
                >
                  {isRotating ? "Pause Spin" : "Auto Spin"}
                </button>
              </div>
            </div>
          </div>

          {/* Specimen Dossier & Metrics Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--md-champagne)",
                  fontWeight: 600,
                  display: "block",
                  marginBottom: "var(--md-space-1)",
                }}
              >
                {activeSpecimen.subhead}
              </span>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--md-font-display)",
                  fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                  fontWeight: 400,
                  color: "var(--md-fg-inverse)",
                  lineHeight: 1.15,
                }}
              >
                {activeSpecimen.name}
              </h3>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                lineHeight: 1.7,
                color: "color-mix(in srgb, var(--md-fg-inverse) 84%, transparent)",
              }}
            >
              {activeSpecimen.description}
            </p>

            {/* Technical Specification Matrix */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "1px",
                background: "color-mix(in srgb, var(--md-champagne) 22%, transparent)",
                border: "1px solid color-mix(in srgb, var(--md-champagne) 22%, transparent)",
                borderRadius: "var(--md-radius-sm, 0px)",
                overflow: "hidden",
                marginBlock: "var(--md-space-2)",
              }}
            >
              <div style={{ background: "rgba(5, 20, 12, 0.7)", padding: "12px 16px" }}>
                <span style={{ fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)", display: "block" }}>
                  Carat Weight
                </span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.carat}
                </span>
              </div>
              <div style={{ background: "rgba(5, 20, 12, 0.7)", padding: "12px 16px" }}>
                <span style={{ fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)", display: "block" }}>
                  Mohs Hardness
                </span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.mohs}
                </span>
              </div>
              <div style={{ background: "rgba(5, 20, 12, 0.7)", padding: "12px 16px" }}>
                <span style={{ fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)", display: "block" }}>
                  Cut Geometry
                </span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.cut}
                </span>
              </div>
              <div style={{ background: "rgba(5, 20, 12, 0.7)", padding: "12px 16px" }}>
                <span style={{ fontSize: "0.625rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--md-champagne)", display: "block" }}>
                  Refractive Index
                </span>
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--md-fg-inverse)" }}>
                  {activeSpecimen.refractiveIndex}
                </span>
              </div>
            </div>

            {/* Action CTA */}
            <div style={{ marginTop: "var(--md-space-2)" }}>
              <Link
                href={`${marketPrefix}${activeSpecimen.targetHref}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 28px",
                  background: "var(--md-champagne)",
                  color: "var(--md-green-black)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  textDecoration: "none",
                  borderRadius: "var(--md-radius-sm, 0px)",
                  transition: "all 200ms ease",
                }}
              >
                <span>View Matching Jewellery Creations</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
