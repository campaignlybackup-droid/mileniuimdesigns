"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * HeroGemstoneCanvas — 3D Sovereign Jaipur Emerald Ring & Caustic Pedestal.
 *
 * Renders a full 3D emerald ring complete with gold band, prong geometry,
 * refractive step-cut emerald facets, floor caustic reflections, and interactive
 * 360-degree drag and tilt. Runs at 60fps on HTML5 Canvas with high-DPI scaling.
 */
export function HeroGemstoneCanvas(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Interaction & drag state
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let dragAngleX = 0;
    let dragAngleY = 0;
    let targetDragAngleX = 0;
    let targetDragAngleY = 0;

    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      setIsInteracting(true);
      startX = e.clientX;
      startY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetMouseX = x * 0.5;
      targetMouseY = y * 0.5;

      if (isDragging) {
        const deltaX = (e.clientX - startX) * 0.008;
        const deltaY = (e.clientY - startY) * 0.008;
        targetDragAngleY += deltaX;
        targetDragAngleX += deltaY;
        startX = e.clientX;
        startY = e.clientY;
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      setIsInteracting(false);
    };

    // Touch support for mobile 3D interaction
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = (e.touches[0].clientX - startX) * 0.01;
        const deltaY = (e.touches[0].clientY - startY) * 0.01;
        targetDragAngleY += deltaX;
        targetDragAngleX += deltaY;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseUp);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = rect?.width || 540;
      height = rect?.height || 640;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    // ── 3D Geometry: Step-cut Emerald ──────────────────────────────
    const crownTop = [
      [-0.45, -0.75, 0.45],
      [0.45, -0.75, 0.45],
      [0.75, -0.45, 0.45],
      [0.75, 0.45, 0.45],
      [0.45, 0.75, 0.45],
      [-0.45, 0.75, 0.45],
      [-0.75, 0.45, 0.45],
      [-0.75, -0.45, 0.45],
    ];

    const girdle = [
      [-0.65, -1.05, 0.15],
      [0.65, -1.05, 0.15],
      [1.05, -0.65, 0.15],
      [1.05, 0.65, 0.15],
      [0.65, 1.05, 0.15],
      [-0.65, 1.05, 0.15],
      [-1.05, 0.65, 0.15],
      [-1.05, -0.65, 0.15],
    ];

    const pavilionBottom = [
      [-0.15, -0.35, -0.6],
      [0.15, -0.35, -0.6],
      [0.35, -0.15, -0.6],
      [0.35, 0.15, -0.6],
      [0.15, 0.35, -0.6],
      [-0.15, 0.35, -0.6],
      [-0.35, 0.15, -0.6],
      [-0.35, -0.15, -0.6],
    ];

    // 3D Ring Band Curve (Torus segments in YZ plane beneath the stone)
    const bandSegments = 24;
    const bandRadius = 1.15;
    const bandPoints: number[][] = [];
    for (let i = 0; i <= bandSegments; i++) {
      const theta = (i / bandSegments) * Math.PI * 1.8 + Math.PI * 0.1;
      // Band loops under the stone (negative Z)
      const by = Math.cos(theta) * bandRadius;
      const bz = Math.sin(theta) * bandRadius - 1.25;
      bandPoints.push([0, by, bz]);
    }

    // 4 Corner Claw Prongs
    const prongs = [
      [-0.68, -1.08, 0.25],
      [0.68, -1.08, 0.25],
      [0.68, 1.08, 0.25],
      [-0.68, 1.08, 0.25],
    ];

    // Ambient floating gold particles
    const particles = Array.from({ length: 36 }, () => ({
      x: (Math.random() - 0.5) * 3.2,
      y: (Math.random() - 0.5) * 3.2,
      z: (Math.random() - 0.5) * 2.4,
      size: Math.random() * 1.6 + 0.6,
      speed: Math.random() * 0.006 + 0.002,
      pulse: Math.random() * Math.PI * 2,
    }));

    let baseAngleY = 0;
    let baseAngleX = 0.28;

    const project = (
      p: number[],
      rotX: number,
      rotY: number,
      scale: number,
      cx: number,
      cy: number
    ): [number, number, number] => {
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = p[0] * cosY - p[2] * sinY;
      const z1 = p[0] * sinY + p[2] * cosY;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = p[1] * cosX - z1 * sinX;
      const z2 = p[1] * sinX + z1 * cosX;

      const fov = 3.6;
      const dist = z2 + fov;
      const proj = fov / Math.max(dist, 0.1);

      return [cx + x1 * scale * proj, cy + y2 * scale * proj, z2];
    };

    const render = (time: number) => {
      // Smooth drag and parallax easing
      dragAngleX += (targetDragAngleX - dragAngleX) * 0.08;
      dragAngleY += (targetDragAngleY - dragAngleY) * 0.08;
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      // Celestial orbit + drag + parallax
      baseAngleY = time * 0.00035 + dragAngleY + mouseX;
      baseAngleX = 0.26 + Math.sin(time * 0.00025) * 0.1 + dragAngleX + mouseY;

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.48;
      const baseScale = Math.min(width, height) * 0.36;

      // ── 1. Pedestal Floor Caustic Reflection ────────────────────────
      const floorY = cy + baseScale * 0.95;
      const causticRadius = baseScale * 1.1;
      const floorCaustic = ctx.createRadialGradient(
        cx,
        floorY,
        10,
        cx,
        floorY,
        causticRadius
      );
      const causticPulse = Math.sin(time * 0.0018) * 0.12 + 0.88;
      floorCaustic.addColorStop(0, `rgba(0, 156, 23, ${0.45 * causticPulse})`);
      floorCaustic.addColorStop(0.35, `rgba(6, 46, 27, ${0.28 * causticPulse})`);
      floorCaustic.addColorStop(0.7, "rgba(4, 14, 9, 0.1)");
      floorCaustic.addColorStop(1, "transparent");

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, floorY, causticRadius, causticRadius * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = floorCaustic;
      ctx.fill();
      ctx.restore();

      // ── 2. Floating Gold Stardust Particles ────────────────────────
      particles.forEach((pt) => {
        pt.pulse += pt.speed;
        const currentY = pt.y + Math.sin(pt.pulse) * 0.08;
        const [px, py, pz] = project([pt.x, currentY, pt.z], baseAngleX, baseAngleY, baseScale, cx, cy);
        if (pz > -2.2) {
          const alpha = (Math.sin(pt.pulse * 2) * 0.4 + 0.6) * Math.max(0, (pz + 1.8) / 3.6);
          ctx.beginPath();
          ctx.arc(px, py, pt.size * ((pz + 2.5) / 3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212, 191, 136, ${alpha * 0.8})`;
          ctx.fill();
        }
      });

      // ── 3. 3D Ring Band in 18K Solid Gold / Sterling Silver ────────
      const projBand = bandPoints.map((p) =>
        project(p, baseAngleX, baseAngleY, baseScale, cx, cy)
      );

      // Draw rear of the band first (depth sorting)
      ctx.lineWidth = 14 * (baseScale / 200);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Band metallic gradient
      const bandGrad = ctx.createLinearGradient(
        cx - baseScale * 0.8,
        cy,
        cx + baseScale * 0.8,
        cy
      );
      bandGrad.addColorStop(0, "#8f733e"); // Antique gold shadow
      bandGrad.addColorStop(0.3, "#dfc68b"); // Champagne reflection
      bandGrad.addColorStop(0.5, "#f7ecd4"); // Specular glint
      bandGrad.addColorStop(0.7, "#c8b27a"); // Pure gold midtone
      bandGrad.addColorStop(1, "#7a5e29");

      ctx.beginPath();
      projBand.forEach(([bx, by], idx) => {
        if (idx === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      });
      ctx.strokeStyle = bandGrad;
      ctx.shadowColor = "rgba(200, 178, 122, 0.35)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner ring highlight hairline
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 245, 220, 0.7)";
      ctx.beginPath();
      projBand.forEach(([bx, by], idx) => {
        if (idx === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      });
      ctx.stroke();

      // ── 4. Project 3D Emerald Vertices ─────────────────────────────
      const projCrown = crownTop.map((v) => project(v, baseAngleX, baseAngleY, baseScale, cx, cy));
      const projGirdle = girdle.map((v) => project(v, baseAngleX, baseAngleY, baseScale, cx, cy));
      const projPavilion = pavilionBottom.map((v) => project(v, baseAngleX, baseAngleY, baseScale, cx, cy));

      // ── 5. Pavilion Under-Facets (Deep Emerald Reflection) ─────────
      for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8;
        ctx.beginPath();
        ctx.moveTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.lineTo(projPavilion[i][0], projPavilion[i][1]);
        ctx.lineTo(projPavilion[next][0], projPavilion[next][1]);
        ctx.lineTo(projGirdle[next][0], projGirdle[next][1]);
        ctx.closePath();

        const lightFactor = Math.abs(Math.sin(baseAngleY + (i * Math.PI) / 4));
        ctx.fillStyle = `rgba(2, 45, 23, ${0.45 + lightFactor * 0.35})`;
        ctx.fill();
      }

      // ── 6. Crown Facets (Prism Color Refraction) ───────────────────
      for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8;
        ctx.beginPath();
        ctx.moveTo(projCrown[i][0], projCrown[i][1]);
        ctx.lineTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.lineTo(projGirdle[next][0], projGirdle[next][1]);
        ctx.lineTo(projCrown[next][0], projCrown[next][1]);
        ctx.closePath();

        const facetLight = Math.abs(Math.cos(baseAngleY + (i * Math.PI) / 4));
        ctx.fillStyle = `rgba(0, 156, 23, ${0.25 + facetLight * 0.45})`;
        ctx.fill();
      }

      // ── 7. Table Facet (Top Emerald Mirror Plane) ──────────────────
      ctx.beginPath();
      projCrown.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();

      const tableGrad = ctx.createLinearGradient(
        projCrown[0][0],
        projCrown[0][1],
        projCrown[4][0],
        projCrown[4][1]
      );
      tableGrad.addColorStop(0, "rgba(0, 175, 35, 0.65)");
      tableGrad.addColorStop(0.4, "rgba(6, 60, 32, 0.85)");
      tableGrad.addColorStop(1, "rgba(0, 48, 24, 0.75)");
      ctx.fillStyle = tableGrad;
      ctx.fill();

      // ── 8. Royal Gold Wireframe Facet Lines ────────────────────────
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(212, 191, 136, 0.75)";
      ctx.shadowColor = "rgba(245, 231, 200, 0.6)";
      ctx.shadowBlur = 5;

      // Table contour
      ctx.beginPath();
      projCrown.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Girdle contour
      ctx.beginPath();
      projGirdle.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(200, 178, 122, 0.65)";
      ctx.stroke();

      // Crown ribs
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        ctx.moveTo(projCrown[i][0], projCrown[i][1]);
        ctx.lineTo(projGirdle[i][0], projGirdle[i][1]);
      }
      ctx.strokeStyle = "rgba(212, 191, 136, 0.6)";
      ctx.stroke();

      // ── 9. Four 18K Gold Claw Prongs ──────────────────────────────
      prongs.forEach((pr) => {
        const [px, py] = project(pr, baseAngleX, baseAngleY, baseScale, cx, cy);
        ctx.beginPath();
        ctx.arc(px, py, 4.5 * (baseScale / 200), 0, Math.PI * 2);
        ctx.fillStyle = "#f5e7c8";
        ctx.shadowColor = "#f5e7c8";
        ctx.shadowBlur = 6;
        ctx.fill();
      });
      ctx.shadowBlur = 0;

      // ── 10. Specular Caustic Glint (Sunburst Sweep) ───────────────
      const sweepAngle = (time * 0.0012) % (Math.PI * 2);
      const sweepIdx = Math.floor(((sweepAngle / (Math.PI * 2)) * 8) % 8);
      const sweepCorner = projCrown[sweepIdx];
      if (sweepCorner) {
        const glint = ctx.createRadialGradient(
          sweepCorner[0],
          sweepCorner[1],
          0,
          sweepCorner[0],
          sweepCorner[1],
          32
        );
        glint.addColorStop(0, "rgba(255, 255, 255, 0.98)");
        glint.addColorStop(0.3, "rgba(245, 231, 200, 0.75)");
        glint.addColorStop(0.7, "rgba(0, 156, 23, 0.25)");
        glint.addColorStop(1, "transparent");

        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(sweepCorner[0], sweepCorner[1], 32, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 580,
        height: "clamp(480px, 62vh, 680px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
      }}
    >
      {/* 3D Celestial Meridian Orbit Rings */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "8%",
          borderRadius: "50%",
          border: "1px dashed color-mix(in srgb, var(--md-champagne) 24%, transparent)",
          pointerEvents: "none",
          animation: "spin 90s linear infinite",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "18%",
          borderRadius: "50%",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 14%, transparent)",
          pointerEvents: "none",
        }}
      />

      {/* 3D Solitaire Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          position: "relative",
          zIndex: 2,
          cursor: isInteracting ? "grabbing" : "grab",
          touchAction: "none",
        }}
      />

      {/* Interactive Drag Pill Indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 14px",
          borderRadius: "var(--md-radius-pill)",
          background: "rgba(6, 19, 13, 0.8)",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 30%, transparent)",
          backdropFilter: "blur(8px)",
          color: "var(--md-champagne)",
          fontSize: "0.625rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontFamily: "var(--md-font-crest), Georgia, serif",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <span>✦ Drag to Rotate 360°</span>
      </div>
    </div>
  );
}
