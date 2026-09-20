"use client";

import React, { useEffect, useRef } from "react";

/**
 * HeroGemstoneCanvas — 3D Octagonal Emerald & Sacred Geometry Refractor.
 *
 * Mathematically projects an octagonal step-cut emerald in 3D space with
 * dynamic caustic refraction, gold light sweeps, and floating stellar dust.
 * Runs at a silky 60fps on HTML5 Canvas with high-DPI scaling and gentle
 * cursor parallax inertia.
 */
export function HeroGemstoneCanvas(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Mouse coordinates with easing
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetMouseX = x * 0.8;
      targetMouseY = y * 0.8;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

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

    // 3D Geometry: Step-cut Octagonal Jaipur Emerald
    // Table facet, Crown corners, Girdle, Pavilion culet
    const crownTop = [
      [-0.55, -0.85, 0.35],
      [0.55, -0.85, 0.35],
      [0.85, -0.55, 0.35],
      [0.85, 0.55, 0.35],
      [0.55, 0.85, 0.35],
      [-0.55, 0.85, 0.35],
      [-0.85, 0.55, 0.35],
      [-0.85, -0.55, 0.35],
    ];

    const girdle = [
      [-0.75, -1.15, 0],
      [0.75, -1.15, 0],
      [1.15, -0.75, 0],
      [1.15, 0.75, 0],
      [0.75, 1.15, 0],
      [-0.75, 1.15, 0],
      [-1.15, 0.75, 0],
      [-1.15, -0.75, 0],
    ];

    const pavilionBottom = [
      [-0.2, -0.4, -0.7],
      [0.2, -0.4, -0.7],
      [0.4, -0.2, -0.7],
      [0.4, 0.2, -0.7],
      [0.2, 0.4, -0.7],
      [-0.2, 0.4, -0.7],
      [-0.4, 0.2, -0.7],
      [-0.4, -0.2, -0.7],
    ];

    // Floating Stardust Particles
    const particles = Array.from({ length: 42 }, () => ({
      x: (Math.random() - 0.5) * 2.8,
      y: (Math.random() - 0.5) * 2.8,
      z: (Math.random() - 0.5) * 2.0,
      size: Math.random() * 1.8 + 0.6,
      pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.008 + 0.003,
    }));

    let angleX = 0.25;
    let angleY = 0.4;
    let angleZ = 0.1;

    const project = (
      p: number[],
      rotX: number,
      rotY: number,
      scale: number,
      cx: number,
      cy: number
    ): [number, number, number] => {
      // Rotate Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = p[0] * cosY - p[2] * sinY;
      const z1 = p[0] * sinY + p[2] * cosY;

      // Rotate X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = p[1] * cosX - z1 * sinX;
      const z2 = p[1] * sinX + z1 * cosX;

      // Perspective projection
      const fov = 3.2;
      const dist = z2 + fov;
      const proj = fov / Math.max(dist, 0.1);

      return [cx + x1 * scale * proj, cy + y2 * scale * proj, z2];
    };

    const render = (time: number) => {
      // Inertia mouse smoothing
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      // Continuous celestial rotation + user parallax
      angleY = time * 0.00045 + mouseX * 0.9;
      angleX = 0.35 + Math.sin(time * 0.0003) * 0.15 + mouseY * 0.9;
      angleZ = Math.cos(time * 0.00025) * 0.08;

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const baseScale = Math.min(width, height) * 0.38;

      // Ambient radial caustic glow behind the stone
      const pulse = Math.sin(time * 0.0012) * 0.15 + 0.85;
      const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, baseScale * 1.6);
      radial.addColorStop(0, `rgba(0, 156, 23, ${0.28 * pulse})`);
      radial.addColorStop(0.35, `rgba(0, 61, 31, ${0.18 * pulse})`);
      radial.addColorStop(0.7, "rgba(6, 19, 13, 0.06)");
      radial.addColorStop(1, "transparent");
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      // Render Floating Gold Stardust
      particles.forEach((pt) => {
        pt.pulse += pt.speed;
        const currentY = pt.y + Math.sin(pt.pulse) * 0.05;
        const [px, py, pz] = project([pt.x, currentY, pt.z], angleX, angleY, baseScale, cx, cy);
        if (pz > -2) {
          const alpha = (Math.sin(pt.pulse * 2) * 0.4 + 0.6) * Math.max(0, (pz + 1.5) / 3);
          ctx.beginPath();
          ctx.arc(px, py, pt.size * ((pz + 2) / 2.5), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212, 191, 136, ${alpha * 0.85})`;
          ctx.shadowColor = "#f5e7c8";
          ctx.shadowBlur = 6;
          ctx.fill();
        }
      });
      ctx.shadowBlur = 0;

      // Project all vertices
      const projCrown = crownTop.map((v) => project(v, angleX, angleY, baseScale, cx, cy));
      const projGirdle = girdle.map((v) => project(v, angleX, angleY, baseScale, cx, cy));
      const projPavilion = pavilionBottom.map((v) => project(v, angleX, angleY, baseScale, cx, cy));

      // 1. Draw Table Facet (Top Emerald Plane)
      ctx.beginPath();
      projCrown.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();

      // Translucent Emerald Glass Shimmer Fill
      const tableGrad = ctx.createLinearGradient(
        projCrown[0][0],
        projCrown[0][1],
        projCrown[4][0],
        projCrown[4][1]
      );
      tableGrad.addColorStop(0, "rgba(0, 156, 23, 0.38)");
      tableGrad.addColorStop(0.5, "rgba(8, 61, 35, 0.55)");
      tableGrad.addColorStop(1, "rgba(0, 45, 22, 0.45)");
      ctx.fillStyle = tableGrad;
      ctx.fill();

      // 2. Draw Crown Facet Ribs (Crown to Girdle)
      for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8;
        ctx.beginPath();
        ctx.moveTo(projCrown[i][0], projCrown[i][1]);
        ctx.lineTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.lineTo(projGirdle[next][0], projGirdle[next][1]);
        ctx.lineTo(projCrown[next][0], projCrown[next][1]);
        ctx.closePath();

        // Shading depending on light angle
        const lightIntensity = Math.abs(Math.cos(angleY + (i * Math.PI) / 4));
        ctx.fillStyle = `rgba(0, 95, 40, ${0.12 + lightIntensity * 0.26})`;
        ctx.fill();
      }

      // 3. Draw Pavilion Facets (Girdle to Culet)
      for (let i = 0; i < 8; i++) {
        const next = (i + 1) % 8;
        ctx.beginPath();
        ctx.moveTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.lineTo(projPavilion[i][0], projPavilion[i][1]);
        ctx.lineTo(projPavilion[next][0], projPavilion[next][1]);
        ctx.lineTo(projGirdle[next][0], projGirdle[next][1]);
        ctx.closePath();

        const pavilionLight = Math.abs(Math.sin(angleY + (i * Math.PI) / 4));
        ctx.fillStyle = `rgba(4, 38, 20, ${0.2 + pavilionLight * 0.25})`;
        ctx.fill();
      }

      // 4. Draw Royal Gold Wireframe Edges with Caustic Specular Glow
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(212, 191, 136, 0.65)"; // Antique Champagne Gold Wireframe
      ctx.shadowColor = "rgba(245, 231, 200, 0.5)";
      ctx.shadowBlur = 4;

      // Table Outline
      ctx.beginPath();
      projCrown.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      // Girdle Outline
      ctx.beginPath();
      projGirdle.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(200, 178, 122, 0.55)";
      ctx.stroke();

      // Culet Outline
      ctx.beginPath();
      projPavilion.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(200, 178, 122, 0.4)";
      ctx.stroke();

      // Crown Ribs
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        ctx.moveTo(projCrown[i][0], projCrown[i][1]);
        ctx.lineTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.moveTo(projGirdle[i][0], projGirdle[i][1]);
        ctx.lineTo(projPavilion[i][0], projPavilion[i][1]);
      }
      ctx.strokeStyle = "rgba(212, 191, 136, 0.55)";
      ctx.stroke();

      // 5. Specular Caustic Prism Sweep across Table Corner
      const sweepAngle = (time * 0.001) % (Math.PI * 2);
      const sweepIdx = Math.floor(((sweepAngle / (Math.PI * 2)) * 8) % 8);
      const sweepCorner = projCrown[sweepIdx];
      if (sweepCorner) {
        const star = ctx.createRadialGradient(
          sweepCorner[0],
          sweepCorner[1],
          0,
          sweepCorner[0],
          sweepCorner[1],
          28
        );
        star.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        star.addColorStop(0.3, "rgba(245, 231, 200, 0.7)");
        star.addColorStop(0.7, "rgba(0, 156, 23, 0.2)");
        star.addColorStop(1, "transparent");

        ctx.fillStyle = star;
        ctx.beginPath();
        ctx.arc(sweepCorner[0], sweepCorner[1], 28, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 580,
        height: "clamp(460px, 60vh, 680px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Decorative Astrological Jaipur Meridian Ring */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "10%",
          borderRadius: "50%",
          border: "1px dashed color-mix(in srgb, var(--md-champagne) 26%, transparent)",
          pointerEvents: "none",
          animation: "spin 80s linear infinite",
        }}
      />

      {/* High-DPI 3D Refractor Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          position: "relative",
          zIndex: 2,
          cursor: "grab",
        }}
      />

      {/* Ambient Radial Vignette */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 50%, transparent 45%, var(--md-green-black) 95%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
