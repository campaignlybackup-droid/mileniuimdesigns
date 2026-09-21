"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * HeroGemstoneCanvas — 3D Sovereign Jaipur Emerald Ring & Caustic Pedestal.
 *
 * Renders a full 3D emerald ring complete with cold-forged silver/gold band, prong geometry,
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
      targetMouseX = x * 0.45;
      targetMouseY = y * 0.45;

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
        setIsInteracting(true);
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
    const particles = Array.from({ length: 42 }, () => ({
      x: (Math.random() - 0.5) * 3.4,
      y: (Math.random() - 0.5) * 3.4,
      z: (Math.random() - 0.5) * 2.6,
      size: Math.random() * 1.8 + 0.6,
      speed: Math.random() * 0.005 + 0.002,
      pulse: Math.random() * Math.PI * 2,
    }));

    let baseAngleY = 0;
    let baseAngleX = 0.26;

    // 3D Projection Helper
    const project = (
      point: number[],
      rotX: number,
      rotY: number,
      scale: number,
      centerX: number,
      centerY: number
    ): [number, number, number] => {
      let [x, y, z] = point;

      // Rotate around X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;

      // Rotate around Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x2 = x * cosY + z1 * sinY;
      const z2 = -x * sinY + z1 * cosY;

      // Perspective projection
      const cameraDistance = 4.2;
      const fov = scale / (cameraDistance - z2);
      const px = centerX + x2 * fov;
      const py = centerY - y1 * fov;

      return [px, py, z2];
    };

    // ── Render Loop ────────────────────────────────────────────────
    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Smooth interpolation for mouse parallax and drag inertia
      dragAngleX += (targetDragAngleX - dragAngleX) * 0.08;
      dragAngleY += (targetDragAngleY - dragAngleY) * 0.08;
      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;

      if (!isDragging) {
        baseAngleY = time * 0.0006 + dragAngleY + mouseX;
        baseAngleX = 0.26 + Math.sin(time * 0.0008) * 0.08 + dragAngleX + mouseY;
      } else {
        baseAngleY = dragAngleY;
        baseAngleX = dragAngleX;
      }

      const cx = width * 0.5;
      const cy = height * 0.48;
      const baseScale = Math.min(width, height) * 0.38;

      // ── 1. Pedestal Floor Shadow & Green Caustic Glow ─────────────
      const causticPulse = Math.sin(time * 0.002) * 15 + 95;
      const caustic = ctx.createRadialGradient(cx, cy + baseScale * 0.72, 10, cx, cy + baseScale * 0.72, causticPulse);
      caustic.addColorStop(0, "rgba(0, 210, 110, 0.32)");
      caustic.addColorStop(0.45, "rgba(2, 60, 32, 0.18)");
      caustic.addColorStop(1, "transparent");
      ctx.fillStyle = caustic;
      ctx.beginPath();
      ctx.ellipse(cx, cy + baseScale * 0.72, baseScale * 0.85, baseScale * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Floor Shadow
      const shadow = ctx.createRadialGradient(cx, cy + baseScale * 0.65, 0, cx, cy + baseScale * 0.65, baseScale * 0.65);
      shadow.addColorStop(0, "rgba(0, 0, 0, 0.55)");
      shadow.addColorStop(0.6, "rgba(0, 15, 8, 0.25)");
      shadow.addColorStop(1, "transparent");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + baseScale * 0.65, baseScale * 0.65, baseScale * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── 2. Ambient Gold Particle Flakes ───────────────────────────
      particles.forEach((p) => {
        p.pulse += 0.02;
        const [px, py] = project([p.x, p.y + Math.sin(p.pulse) * 0.15, p.z], baseAngleX * 0.4, baseAngleY * 0.4, baseScale, cx, cy);
        const pAlpha = 0.25 + Math.sin(p.pulse) * 0.2;
        ctx.fillStyle = `rgba(224, 204, 152, ${pAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── 3. Project & Draw Ring Band (Cold-Forged Silver/Gold) ─────
      const projBand = bandPoints.map((pt) => project(pt, baseAngleX, baseAngleY, baseScale, cx, cy));

      ctx.beginPath();
      projBand.forEach(([bx, by], idx) => {
        if (idx === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      });
      ctx.lineWidth = 14 * (baseScale / 200);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Band metallic gradient
      const bandGrad = ctx.createLinearGradient(cx - baseScale * 0.5, cy, cx + baseScale * 0.5, cy);
      bandGrad.addColorStop(0, "#7a6a43");
      bandGrad.addColorStop(0.2, "#e8dcba");
      bandGrad.addColorStop(0.45, "#ffffff");
      bandGrad.addColorStop(0.7, "#c8b27a");
      bandGrad.addColorStop(1, "#66542f");
      ctx.strokeStyle = bandGrad;
      ctx.shadowColor = "rgba(200, 178, 122, 0.35)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner ring highlight hairline
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 245, 220, 0.75)";
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
        height: "clamp(460px, 60vh, 640px)",
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
          background: "rgba(6, 19, 13, 0.82)",
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
        <span>✦ Interactive 3D Model · Drag to Rotate</span>
      </div>
    </div>
  );
}
