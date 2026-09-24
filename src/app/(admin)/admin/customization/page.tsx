"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  DEFAULT_STOREFRONT_CONFIG,
  type StorefrontCustomizationConfig,
  type HeroSlideConfig,
  type TestimonialConfig,
} from "@/lib/cms/storefrontDefaults";

const TABS = [
  { id: "header", label: "Header & Announcement", icon: "✦" },
  { id: "hero", label: "Hero Banner Slider", icon: "◈" },
  { id: "trust", label: "Brand Pillars & Trust", icon: "❖" },
  { id: "homepage", label: "Homepage & Story", icon: "⚜" },
  { id: "nav", label: "Navigation Menus", icon: "☵" },
  { id: "checkout", label: "Checkout & Bank", icon: "⚖" },
  { id: "contact", label: "Store Contact & Care", icon: "✉" },
  { id: "footer", label: "Footer & Social", icon: "❦" },
  { id: "styling", label: "Colors & Theme Styles", icon: "🎨" },
  { id: "policies", label: "Customer Policies", icon: "⚐" },
  { id: "seo", label: "SEO & Social", icon: "🔍" },
];

export default function AdminCustomizationPage() {
  const [activeTab, setActiveTab] = useState("header");
  const [config, setConfig] = useState<StorefrontCustomizationConfig>(
    DEFAULT_STOREFRONT_CONFIG,
  );
  const [market, setMarket] = useState<string>("global");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Fetch current config on load / market change
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const query = market === "global" ? "" : `?market=${market}`;
        const res = await fetch(`/api/admin/settings${query}`);
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [market]);

  const updateField = <K extends keyof StorefrontCustomizationConfig>(
    key: K,
    value: StorefrontCustomizationConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: config,
          marketCode: market === "global" ? undefined : market,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage({
          text: "All 100+ customization settings saved live to database!",
          type: "success",
        });
      } else {
        setStatusMessage({ text: data.error || "Failed to save settings", type: "error" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error while saving";
      setStatusMessage({ text: msg, type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const handleResetDefaults = () => {
    if (
      confirm(
        "Reset all settings to original store defaults? Unsaved changes will be replaced.",
      )
    ) {
      setConfig({ ...DEFAULT_STOREFRONT_CONFIG });
      setStatusMessage({
        text: "Form reset to store defaults. Click 'Save Live Settings' to commit.",
        type: "success",
      });
    }
  };

  // Helper for Hero Slides
  const addHeroSlide = () => {
    const newSlide: HeroSlideConfig = {
      id: `slide-${Date.now()}`,
      tag: "SPECIAL COLLECTION",
      subhead: "JAIPUR HERITAGE",
      title: "New Masterpiece Creation",
      standfirst: "Natural precious minerals hand-set in 925 sterling silver alloy.",
      ctaText: "Discover Pieces",
      ctaHref: "/rings",
      imageSrc: "/images/categories/rings.jpg",
      imageAlt: "Fine jewellery showcase",
    };
    updateField("heroSlides", [...config.heroSlides, newSlide]);
  };

  const removeHeroSlide = (idx: number) => {
    updateField(
      "heroSlides",
      config.heroSlides.filter((_, i) => i !== idx),
    );
  };

  const updateHeroSlide = (idx: number, patch: Partial<HeroSlideConfig>) => {
    const updated = [...config.heroSlides];
    updated[idx] = { ...updated[idx]!, ...patch };
    updateField("heroSlides", updated);
  };

  // Helper for Testimonials
  const addTestimonial = () => {
    const newT: TestimonialConfig = {
      id: `t-${Date.now()}`,
      clientName: "Valued Collector",
      location: "San Francisco, USA",
      rating: 5,
      reviewText:
        "Exceptional craftsmanship. The gemstone has extraordinary fire and presence.",
      piecePurchased: "Sovereign Gemstone Ring",
      dateStr: "Recent Collector Acquisition",
    };
    updateField("testimonials", [...config.testimonials, newT]);
  };

  const removeTestimonial = (idx: number) => {
    updateField(
      "testimonials",
      config.testimonials.filter((_, i) => i !== idx),
    );
  };

  const updateTestimonial = (idx: number, patch: Partial<TestimonialConfig>) => {
    const updated = [...config.testimonials];
    updated[idx] = { ...updated[idx]!, ...patch };
    updateField("testimonials", updated);
  };

  if (loading) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--md-fg-muted)" }}>
        <div
          style={{
            fontSize: "1.25rem",
            fontFamily: "var(--md-font-display)",
            color: "var(--md-fg)",
          }}
        >
          ✦ Loading Store Customization Engine...
        </div>
        <p style={{ marginTop: 8 }}>Connecting to PostgreSQL settings vault...</p>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* ── TOP CONTROL BAR ────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "var(--md-bg)",
          borderBottom: "1px solid var(--md-rule)",
          padding: "16px var(--md-space-8)",
          margin: "0 calc(-1 * var(--md-space-8)) 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--md-gold)", fontSize: "1rem" }}>✦</span>
            <h1
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--md-fg)",
                margin: 0,
              }}
            >
              Storefront CMS &amp; 100+ Customizations Portal
            </h1>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
            Live control panel for every visual, content, banking, and structural element of the
            storefront.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Market selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--md-fg-secondary)" }}>Scope:</span>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 4,
                border: "1px solid var(--md-rule)",
                background: "var(--md-bg-raised)",
                color: "var(--md-fg)",
                fontWeight: 500,
                fontSize: "0.8125rem",
              }}
            >
              <option value="global">Global (Both Markets)</option>
              <option value="US">US Market (USD $)</option>
              <option value="IN">India Market (INR ₹)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleResetDefaults}
            style={{
              padding: "8px 16px",
              borderRadius: 4,
              border: "1px solid var(--md-rule)",
              background: "transparent",
              color: "var(--md-fg-secondary)",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            Reset Defaults
          </button>

          <Link
            href="/"
            target="_blank"
            style={{
              padding: "8px 14px",
              borderRadius: 4,
              border: "1px solid var(--md-rule)",
              background: "var(--md-bg-subtle)",
              color: "var(--md-fg)",
              textDecoration: "none",
              fontSize: "0.8125rem",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>↗</span> Preview Live
          </Link>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 4,
              border: "none",
              background: "var(--md-green-black)",
              color: "var(--md-fg-inverse)",
              cursor: saving ? "wait" : "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
              letterSpacing: "0.04em",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>✦</span> {saving ? "Saving Live..." : "Save 100+ Customizations"}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: "12px 20px",
            marginBottom: 20,
            borderRadius: 4,
            background:
              statusMessage.type === "success"
                ? "color-mix(in srgb, var(--md-success) 12%, var(--md-bg-raised))"
                : "color-mix(in srgb, var(--md-danger) 12%, var(--md-bg-raised))",
            color: statusMessage.type === "success" ? "var(--md-success)" : "var(--md-danger)",
            border: `1px solid ${statusMessage.type === "success" ? "var(--md-success)" : "var(--md-danger)"}`,
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* ── DAILY SILVER RATE & BULK PRICING CALLOUT ────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #182c23 0%, #264336 100%)",
          color: "#ffffff",
          borderRadius: 10,
          padding: "18px 24px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 4px 12px rgba(24, 44, 35, 0.12)",
          border: "1px solid #365646",
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: "1.25rem" }}>💎</span>
            <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "0.02em" }}>
              Daily Silver Rate & Bulk Price Adjustment
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                background: "#c5a880",
                color: "#182c23",
                padding: "2px 8px",
                borderRadius: 4,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              Daily Tool
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#e3decb", lineHeight: 1.4 }}>
            Silver rates change daily. Easily update all 520+ silver jewellery catalogue prices across India (₹) and US ($) in seconds using percentage changes, flat adjustments, or silver gram rate recalculations.
          </p>
        </div>
        <Link
          href="/admin/pricing"
          style={{
            background: "#ffffff",
            color: "#182c23",
            padding: "10px 18px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: "0.85rem",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          <span>Open Bulk Pricing Tool</span>
          <span style={{ fontSize: "1rem" }}>→</span>
        </Link>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          background: "#ffffff",
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid var(--md-rule, #e7e2d7)",
        }}
      >
        <span style={{ fontSize: "1rem", color: "#6e6b63" }}>🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter or search 100+ settings (e.g. silver, banner, phone, email, color, return, guarantee, hero)..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: "0.875rem",
            color: "var(--md-fg, #222)",
            background: "transparent",
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            style={{
              border: "none",
              background: "#ede8df",
              borderRadius: 4,
              padding: "2px 8px",
              fontSize: "0.75rem",
              cursor: "pointer",
              color: "#555",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── TAB NAVIGATION ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 24,
          borderBottom: "1px solid var(--md-rule)",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: "4px 4px 0 0",
                border: "1px solid",
                borderColor: isActive
                  ? "var(--md-rule) var(--md-rule) transparent var(--md-rule)"
                  : "transparent",
                background: isActive ? "var(--md-bg)" : "transparent",
                color: isActive ? "var(--md-fg)" : "var(--md-fg-muted)",
                fontWeight: isActive ? 600 : 500,
                fontSize: "0.8125rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB PANELS ────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          borderRadius: 6,
          padding: "clamp(20px, 3vw, 32px)",
        }}
      >
        {/* TAB 1: HEADER & TOP RIBBON */}
        {activeTab === "header" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Header & Top Ribbon Customization"
              subtitle="Control the announcement bar, logos, hallmarks, and header actions."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              <ToggleField
                label="Show Top Announcement Bar"
                checked={config.announcementVisible}
                onChange={(v) => updateField("announcementVisible", v)}
                desc="Toggle visibility of the topmost announcement strip."
              />

              <InputField
                label="Announcement Text"
                value={config.announcementText}
                onChange={(v) => updateField("announcementText", v)}
                desc="Centered marquee message in the top banner."
              />

              <InputField
                label="Announcement Destination Link"
                value={config.announcementLink}
                onChange={(v) => updateField("announcementLink", v)}
                desc="Optional URL when clicking announcement bar."
              />

              <InputField
                label="Left Provenance Tag"
                value={config.ribbonProvenanceTag}
                onChange={(v) => updateField("ribbonProvenanceTag", v)}
                desc="Left hallmark (e.g. '✦ JOHARI BAZAAR, JAIPUR · EST. 1961')."
              />

              <InputField
                label="Right Banner Tag"
                value={config.ribbonRightTag}
                onChange={(v) => updateField("ribbonRightTag", v)}
                desc="Right hallmark (e.g. 'ANTI-TARNISH 925 SILVER')."
              />

              <ColorField
                label="Announcement Background Color"
                value={config.announcementBgColor}
                onChange={(v) => updateField("announcementBgColor", v)}
              />

              <ColorField
                label="Announcement Text Color"
                value={config.announcementTextColor}
                onChange={(v) => updateField("announcementTextColor", v)}
              />

              <SelectField
                label="Header Logo Display Mode"
                value={config.headerLogoMode}
                options={[
                  { value: "wordmark", label: "Full Wordmark Logo" },
                  { value: "monogram", label: "Compact Monogram Crest" },
                  { value: "custom", label: "Custom Logo Image URL" },
                ]}
                onChange={(v) =>
                  updateField(
                    "headerLogoMode",
                    v as StorefrontCustomizationConfig["headerLogoMode"],
                  )
                }
              />

              {config.headerLogoMode === "custom" && (
                <InputField
                  label="Custom Logo Image URL"
                  value={config.headerCustomLogoUrl}
                  onChange={(v) => updateField("headerCustomLogoUrl", v)}
                  desc="Direct Cloudinary or HTTPS URL to your transparent PNG/SVG logo."
                />
              )}

              <ToggleField
                label="Sticky Header on Scroll"
                checked={config.headerSticky}
                onChange={(v) => updateField("headerSticky", v)}
                desc="Keeps navigation bar fixed to the top of the viewport."
              />

              <ToggleField
                label="Show Search Icon"
                checked={config.headerShowSearch}
                onChange={(v) => updateField("headerShowSearch", v)}
              />

              <ToggleField
                label="Show Account / Login Icon"
                checked={config.headerShowAccount}
                onChange={(v) => updateField("headerShowAccount", v)}
              />

              <ToggleField
                label="Show 1-Tap Currency Switcher"
                checked={config.headerShowCurrency}
                onChange={(v) => updateField("headerShowCurrency", v)}
              />
            </div>
          </div>
        )}

        {/* TAB 2: HERO CAMPAIGN SLIDER */}
        {activeTab === "hero" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Hero Campaign Slider Builder"
              subtitle="Add, remove, reorder, and configure luxury slides on the homepage hero."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 20,
                marginBottom: 16,
              }}
            >
              <ToggleField
                label="Autoplay Slider Transitions"
                checked={config.heroAutoplayEnabled}
                onChange={(v) => updateField("heroAutoplayEnabled", v)}
              />

              <InputField
                label="Autoplay Interval (milliseconds)"
                type="number"
                value={String(config.heroAutoIntervalMs)}
                onChange={(v) => updateField("heroAutoIntervalMs", Number(v) || 5500)}
                desc="Recommended: 5500 ms (5.5 seconds)."
              />

              <SelectField
                label="Hero Text Alignment"
                value={config.heroTextAlign}
                options={[
                  { value: "left", label: "Left Aligned" },
                  { value: "center", label: "Centered" },
                ]}
                onChange={(v) =>
                  updateField(
                    "heroTextAlign",
                    v as StorefrontCustomizationConfig["heroTextAlign"],
                  )
                }
              />

              <InputField
                label="Dark Scrim Overlay Opacity (0.0 – 1.0)"
                type="number"
                value={String(config.heroOverlayOpacity)}
                onChange={(v) => updateField("heroOverlayOpacity", parseFloat(v) || 0.45)}
                desc="Adjusts contrast for text readability over images."
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.125rem",
                    fontFamily: "var(--md-font-display)",
                  }}
                >
                  Slides ({config.heroSlides.length})
                </h3>
                <button
                  type="button"
                  onClick={addHeroSlide}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    background: "var(--md-bg-subtle)",
                    border: "1px solid var(--md-rule)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                  }}
                >
                  + Add New Hero Slide
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {config.heroSlides.map((slide, idx) => (
                  <div
                    key={slide.id || idx}
                    style={{
                      border: "1px solid var(--md-rule)",
                      borderRadius: 4,
                      padding: 20,
                      background: "var(--md-bg-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: "var(--md-gold)",
                        }}
                      >
                        Slide #{idx + 1}: {slide.title || "Untitled Slide"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeHeroSlide(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--md-danger)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Remove Slide
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <InputField
                        label="Prestige Tag"
                        value={slide.tag}
                        onChange={(v) => updateHeroSlide(idx, { tag: v })}
                      />
                      <InputField
                        label="Subhead / Origin"
                        value={slide.subhead}
                        onChange={(v) => updateHeroSlide(idx, { subhead: v })}
                      />
                      <InputField
                        label="Headline Title"
                        value={slide.title}
                        onChange={(v) => updateHeroSlide(idx, { title: v })}
                      />
                      <InputField
                        label="CTA Button Label"
                        value={slide.ctaText}
                        onChange={(v) => updateHeroSlide(idx, { ctaText: v })}
                      />
                      <InputField
                        label="CTA Destination URL"
                        value={slide.ctaHref}
                        onChange={(v) => updateHeroSlide(idx, { ctaHref: v })}
                      />
                      <InputField
                        label="Background Image URL"
                        value={slide.imageSrc}
                        onChange={(v) => updateHeroSlide(idx, { imageSrc: v })}
                      />
                      <InputField
                        label="Desktop Video URL (.mp4)"
                        value={slide.videoSrc || ""}
                        onChange={(v) => updateHeroSlide(idx, { videoSrc: v, isVideo: Boolean(v) })}
                        desc="e.g. /videos/banner-1080p.mp4"
                      />
                      <InputField
                        label="Mobile Video URL (.mp4)"
                        value={slide.videoMobileSrc || ""}
                        onChange={(v) => updateHeroSlide(idx, { videoMobileSrc: v })}
                        desc="e.g. /videos/banner-mobile.mp4"
                      />
                      <InputField
                        label="Video Poster Image URL"
                        value={slide.videoPoster || ""}
                        onChange={(v) => updateHeroSlide(idx, { videoPoster: v })}
                        desc="e.g. /videos/banner-poster.jpg"
                      />
                    </div>

                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(slide.isVideo)}
                          onChange={(e) => updateHeroSlide(idx, { isVideo: e.target.checked })}
                          style={{ accentColor: "var(--md-gold)" }}
                        />
                        <span>Enable Video Banner Mode for this slide</span>
                      </label>
                    </div>

                    <TextAreaField
                      label="Standfirst / Description Copy"
                      value={slide.standfirst}
                      onChange={(v) => updateHeroSlide(idx, { standfirst: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TRUST PILLARS & PROVENANCE */}
        {activeTab === "trust" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Store Trust Pillars & Guarantees"
              subtitle="Configure the 4 core brand trust pillars beneath the hero."
            />

            <ToggleField
              label="Display Trust Pillars Strip"
              checked={config.trustPillarsVisible}
              onChange={(v) => updateField("trustPillarsVisible", v)}
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 20,
              }}
            >
              <InputField
                label="Founding Year"
                value={config.foundingYear}
                onChange={(v) => updateField("foundingYear", v)}
              />
              <InputField
                label="Silver Purity Guarantee"
                value={config.silverPurityBadge}
                onChange={(v) => updateField("silverPurityBadge", v)}
              />
              <InputField
                label="Hallmark Seal Text"
                value={config.hallmarkText}
                onChange={(v) => updateField("hallmarkText", v)}
              />
              <InputField
                label="Guarantee Badge Title"
                value={config.guaranteeBadgeTitle}
                onChange={(v) => updateField("guaranteeBadgeTitle", v)}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h3
                style={{
                  margin: "0 0 16px",
                  fontSize: "1.125rem",
                  fontFamily: "var(--md-font-display)",
                }}
              >
                Pillar Items
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                {config.trustPillars.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    style={{
                      border: "1px solid var(--md-rule)",
                      borderRadius: 4,
                      padding: 16,
                      background: "var(--md-bg-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--md-gold)" }}
                    >
                      Pillar #{idx + 1}
                    </span>
                    <InputField
                      label="Heading Label"
                      value={p.label}
                      onChange={(v) => {
                        const updated = [...config.trustPillars];
                        updated[idx] = { ...updated[idx]!, label: v };
                        updateField("trustPillars", updated);
                      }}
                    />
                    <InputField
                      label="Sub-detail"
                      value={p.detail}
                      onChange={(v) => {
                        const updated = [...config.trustPillars];
                        updated[idx] = { ...updated[idx]!, detail: v };
                        updateField("trustPillars", updated);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: HOMEPAGE & EDITORIAL STORY */}
        {activeTab === "homepage" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Homepage Sections & Brand Story"
              subtitle="Control visibility, headlines, brand heritage copy, and customer reviews."
            />

            <div>
              <h4 style={{ margin: "0 0 12px", fontSize: "0.9375rem" }}>
                Section Visibility Toggles
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                }}
              >
                <ToggleField
                  label="Hero Slider"
                  checked={config.sectionHeroVisible}
                  onChange={(v) => updateField("sectionHeroVisible", v)}
                />
                <ToggleField
                  label="Trust Pillars Strip"
                  checked={config.sectionTrustVisible}
                  onChange={(v) => updateField("sectionTrustVisible", v)}
                />
                <ToggleField
                  label="Curated Collections Grid"
                  checked={config.sectionCategoriesVisible}
                  onChange={(v) => updateField("sectionCategoriesVisible", v)}
                />
                <ToggleField
                  label="Signature Showcase"
                  checked={config.sectionSignatureVisible}
                  onChange={(v) => updateField("sectionSignatureVisible", v)}
                />
                <ToggleField
                  label="Gemstone Vault Explorer"
                  checked={config.sectionStonesVisible}
                  onChange={(v) => updateField("sectionStonesVisible", v)}
                />
                <ToggleField
                  label="Archival Heritage Story"
                  checked={config.sectionHeritageVisible}
                  onChange={(v) => updateField("sectionHeritageVisible", v)}
                />
                <ToggleField
                  label="Client Testimonials"
                  checked={config.sectionTestimonialsVisible}
                  onChange={(v) => updateField("sectionTestimonialsVisible", v)}
                />
                <ToggleField
                  label="Store Newsletter"
                  checked={config.sectionNewsletterVisible}
                  onChange={(v) => updateField("sectionNewsletterVisible", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>
                Section Titles &amp; Subtitles
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Categories Title"
                  value={config.categoriesSectionTitle}
                  onChange={(v) => updateField("categoriesSectionTitle", v)}
                />
                <InputField
                  label="Categories Subtitle"
                  value={config.categoriesSectionSubtitle}
                  onChange={(v) => updateField("categoriesSectionSubtitle", v)}
                />
                <InputField
                  label="Signature Showcase Title"
                  value={config.signatureSectionTitle}
                  onChange={(v) => updateField("signatureSectionTitle", v)}
                />
                <InputField
                  label="Signature Showcase Subtitle"
                  value={config.signatureSectionSubtitle}
                  onChange={(v) => updateField("signatureSectionSubtitle", v)}
                />
                <InputField
                  label="Gemstone Vault Title"
                  value={config.stonesSectionTitle}
                  onChange={(v) => updateField("stonesSectionTitle", v)}
                />
                <InputField
                  label="Gemstone Vault Subtitle"
                  value={config.stonesSectionSubtitle}
                  onChange={(v) => updateField("stonesSectionSubtitle", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>
                Jaipur Silver Heritage Editorial Copy
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Story Headline"
                  value={config.heritageStoryHeadline}
                  onChange={(v) => updateField("heritageStoryHeadline", v)}
                />
                <InputField
                  label="Master Artisan Signature"
                  value={config.heritageStorySignature}
                  onChange={(v) => updateField("heritageStorySignature", v)}
                />
                <InputField
                  label="Heritage Photo URL"
                  value={config.heritageStoryImageUrl}
                  onChange={(v) => updateField("heritageStoryImageUrl", v)}
                />
              </div>
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <TextAreaField
                  label="Heritage Standfirst Body"
                  value={config.heritageStoryStandfirst}
                  onChange={(v) => updateField("heritageStoryStandfirst", v)}
                />
                <TextAreaField
                  label="Master Silversmith Quote"
                  value={config.heritageStoryQuote}
                  onChange={(v) => updateField("heritageStoryQuote", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h4 style={{ margin: 0, fontSize: "0.9375rem" }}>
                  Client Testimonials ({config.testimonials.length})
                </h4>
                <button
                  type="button"
                  onClick={addTestimonial}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 4,
                    background: "var(--md-bg-subtle)",
                    border: "1px solid var(--md-rule)",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                  }}
                >
                  + Add Testimonial
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {config.testimonials.map((t, idx) => (
                  <div
                    key={t.id || idx}
                    style={{
                      border: "1px solid var(--md-rule)",
                      borderRadius: 4,
                      padding: 16,
                      background: "var(--md-bg-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: "var(--md-gold)",
                        }}
                      >
                        Review by {t.clientName} ({t.location})
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTestimonial(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--md-danger)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <InputField
                        label="Client Name"
                        value={t.clientName}
                        onChange={(v) => updateTestimonial(idx, { clientName: v })}
                      />
                      <InputField
                        label="Location"
                        value={t.location}
                        onChange={(v) => updateTestimonial(idx, { location: v })}
                      />
                      <InputField
                        label="Piece Purchased"
                        value={t.piecePurchased}
                        onChange={(v) => updateTestimonial(idx, { piecePurchased: v })}
                      />
                      <InputField
                        label="Date / Timestamp"
                        value={t.dateStr || ""}
                        onChange={(v) => updateTestimonial(idx, { dateStr: v })}
                      />
                    </div>
                    <TextAreaField
                      label="Review Text"
                      value={t.reviewText}
                      onChange={(v) => updateTestimonial(idx, { reviewText: v })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>Newsletter Bar</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Headline"
                  value={config.newsletterHeadline}
                  onChange={(v) => updateField("newsletterHeadline", v)}
                />
                <InputField
                  label="Button Label"
                  value={config.newsletterButtonText}
                  onChange={(v) => updateField("newsletterButtonText", v)}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <TextAreaField
                  label="Newsletter Subtitle"
                  value={config.newsletterSubtitle}
                  onChange={(v) => updateField("newsletterSubtitle", v)}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: NAVIGATION TAXONOMY */}
        {activeTab === "nav" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Navigation & Taxonomy Menu"
              subtitle="Control menu separators and smartphone quick-rails."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 20,
              }}
            >
              <ToggleField
                label="Show Diamond Separator (✦)"
                checked={config.navShowDiamondSeparator}
                onChange={(v) => updateField("navShowDiamondSeparator", v)}
                desc="Displays prestige diamond glyphs between category items."
              />
              <ToggleField
                label="Show Mobile Scrollable Quick-Rail"
                checked={config.navMobileRailVisible}
                onChange={(v) => updateField("navMobileRailVisible", v)}
                desc="Enables horizontal category slider on smartphone viewports."
              />
              <InputField
                label="Highlight Badge Label"
                value={config.customNavHighlightLabel}
                onChange={(v) => updateField("customNavHighlightLabel", v)}
                desc="Optional tag label (e.g. 'NEW', 'EXCLUSIVE')."
              />
              <InputField
                label="Highlighted Category Slug"
                value={config.customNavHighlightSlug}
                onChange={(v) => updateField("customNavHighlightSlug", v)}
                desc="Slug of category to receive highlight treatment."
              />
            </div>
          </div>
        )}

        {/* TAB 6: CHECKOUT, PAYMENTS & BANK TRANSFER */}
        {activeTab === "checkout" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Checkout, Payments & Bank Transfer"
              subtitle="Configure your ICICI bank transfer details, UPI, and checkout payment gateway rules."
            />

            <div>
              <h4 style={{ margin: "0 0 12px", fontSize: "0.9375rem" }}>
                Payment Gateway Toggles
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <ToggleField
                  label="Enable Bank Transfer (IMPS/NEFT/RTGS)"
                  checked={config.enableBankTransfer}
                  onChange={(v) => updateField("enableBankTransfer", v)}
                />
                <ToggleField
                  label="Enable Stripe (Cards / Apple Pay)"
                  checked={config.enableStripe}
                  onChange={(v) => updateField("enableStripe", v)}
                />
                <ToggleField
                  label="Enable Razorpay (UPI / Netbanking)"
                  checked={config.enableRazorpay}
                  onChange={(v) => updateField("enableRazorpay", v)}
                />
                <ToggleField
                  label="Enable Cash on Delivery (COD)"
                  checked={config.enableCod}
                  onChange={(v) => updateField("enableCod", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>
                Bank Transfer Account Details
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Account Holder Name"
                  value={config.bankAccountName}
                  onChange={(v) => updateField("bankAccountName", v)}
                />
                <InputField
                  label="Bank Name"
                  value={config.bankName}
                  onChange={(v) => updateField("bankName", v)}
                />
                <InputField
                  label="Account Number"
                  value={config.bankAccountNumber}
                  onChange={(v) => updateField("bankAccountNumber", v)}
                />
                <InputField
                  label="IFSC Code"
                  value={config.bankIfscCode}
                  onChange={(v) => updateField("bankIfscCode", v)}
                />
                <InputField
                  label="Account Type"
                  value={config.bankAccountType}
                  onChange={(v) => updateField("bankAccountType", v)}
                />
                <InputField
                  label="Branch Name"
                  value={config.bankBranchName}
                  onChange={(v) => updateField("bankBranchName", v)}
                />
                <InputField
                  label="UPI ID / VPA Handle"
                  value={config.bankUpiId}
                  onChange={(v) => updateField("bankUpiId", v)}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <TextAreaField
                  label="Branch Physical Address"
                  value={config.bankBranchAddress}
                  onChange={(v) => updateField("bankBranchAddress", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>
                Free Shipping &amp; COD Thresholds
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Free Insured Shipping (USD $)"
                  type="number"
                  value={String(config.freeShippingThresholdUsd)}
                  onChange={(v) => updateField("freeShippingThresholdUsd", Number(v) || 250)}
                />
                <InputField
                  label="Free Insured Shipping (INR ₹)"
                  type="number"
                  value={String(config.freeShippingThresholdInr)}
                  onChange={(v) => updateField("freeShippingThresholdInr", Number(v) || 20000)}
                />
                <InputField
                  label="COD Maximum Order Amount (INR ₹)"
                  type="number"
                  value={String(config.codMaxAmount)}
                  onChange={(v) => updateField("codMaxAmount", Number(v) || 10000)}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: STORE CONTACT, SUPPORT & WHATSAPP */}
        {activeTab === "contact" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Store Physical Address & Customer Care"
              subtitle="Update your Jaipur store location, direct phone lines, and customer support."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              <InputField
                label="Entity Name"
                value={config.atelierAddressName}
                onChange={(v) => updateField("atelierAddressName", v)}
              />
              <InputField
                label="Address Line 1"
                value={config.atelierAddressLine1}
                onChange={(v) => updateField("atelierAddressLine1", v)}
              />
              <InputField
                label="Address Line 2"
                value={config.atelierAddressLine2}
                onChange={(v) => updateField("atelierAddressLine2", v)}
              />
              <InputField
                label="City"
                value={config.atelierCity}
                onChange={(v) => updateField("atelierCity", v)}
              />
              <InputField
                label="Postal Code / PIN"
                value={config.atelierPostalCode}
                onChange={(v) => updateField("atelierPostalCode", v)}
              />
              <InputField
                label="State"
                value={config.atelierState}
                onChange={(v) => updateField("atelierState", v)}
              />
              <InputField
                label="Country"
                value={config.atelierCountry}
                onChange={(v) => updateField("atelierCountry", v)}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>
                Direct Phone Numbers &amp; WhatsApp Concierge
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Direct Telephone 1 (Primary)"
                  value={config.directPhonePrimary}
                  onChange={(v) => updateField("directPhonePrimary", v)}
                />
                <InputField
                  label="Direct Telephone 2 (Secondary)"
                  value={config.directPhoneSecondary}
                  onChange={(v) => updateField("directPhoneSecondary", v)}
                />
                <InputField
                  label="WhatsApp Concierge Number (E.164 without +)"
                  value={config.whatsappConciergeNumber}
                  onChange={(v) => updateField("whatsappConciergeNumber", v)}
                  desc="Example: 919829056597"
                />
                <InputField
                  label="Support Email"
                  value={config.supportEmail}
                  onChange={(v) => updateField("supportEmail", v)}
                />
                <InputField
                  label="Wholesale &amp; Press Email"
                  value={config.wholesaleEmail}
                  onChange={(v) => updateField("wholesaleEmail", v)}
                />
                <InputField
                  label="Store Operating Hours"
                  value={config.atelierHours}
                  onChange={(v) => updateField("atelierHours", v)}
                />
              </div>
              <div style={{ marginTop: 16 }}>
                <TextAreaField
                  label="Default WhatsApp Concierge Pre-Filled Message"
                  value={config.whatsappConciergeGreeting}
                  onChange={(v) => updateField("whatsappConciergeGreeting", v)}
                />
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4
                style={{
                  margin: "0 0 8px",
                  fontSize: "0.9375rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>✉</span>
                <span>Gmail Authentication &amp; OTP SMTP Credentials</span>
              </h4>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "0.8125rem",
                  color: "var(--md-fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                Used to dispatch single-use 6-digit verification codes to clients signing in
                with their email address. You can set them here or in your <code>.env</code>{" "}
                file as <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code>.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Gmail Address / Sender Email"
                  value={config.gmailUser || ""}
                  onChange={(v) => updateField("gmailUser", v)}
                  desc="e.g. millenniumdesigns.jaipur@gmail.com"
                />
                <InputField
                  label="16-Character Google App Password"
                  value={config.gmailAppPassword || ""}
                  onChange={(v) => updateField("gmailAppPassword", v)}
                  desc="Generate at Google Account -> Security -> 2-Step Verification -> App Passwords"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: FOOTER & SOCIAL LINKS */}
        {activeTab === "footer" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Footer, Legal Notice & Social Media"
              subtitle="Manage footer hallmarks, copyright statement, and social channels."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              <InputField
                label="Brand Mission Statement"
                value={config.footerBrandStatement}
                onChange={(v) => updateField("footerBrandStatement", v)}
              />
              <InputField
                label="Copyright Notice"
                value={config.footerCopyrightNotice}
                onChange={(v) => updateField("footerCopyrightNotice", v)}
              />
              <InputField
                label="Hallmarks Badge Strip"
                value={config.footerHallmarkStrip}
                onChange={(v) => updateField("footerHallmarkStrip", v)}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "0.9375rem" }}>Social Media Links</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Instagram Profile URL"
                  value={config.socialInstagramUrl}
                  onChange={(v) => updateField("socialInstagramUrl", v)}
                />
                <InputField
                  label="Facebook Page URL"
                  value={config.socialFacebookUrl}
                  onChange={(v) => updateField("socialFacebookUrl", v)}
                />
                <InputField
                  label="Pinterest URL"
                  value={config.socialPinterestUrl}
                  onChange={(v) => updateField("socialPinterestUrl", v)}
                />
                <InputField
                  label="YouTube Channel URL"
                  value={config.socialYoutubeUrl}
                  onChange={(v) => updateField("socialYoutubeUrl", v)}
                />
                <InputField
                  label="Twitter / X Profile URL"
                  value={config.socialTwitterUrl}
                  onChange={(v) => updateField("socialTwitterUrl", v)}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 9: COLORS & CUSTOM CODE */}
        {activeTab === "styling" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Global Colors, Luxury Cursor & Code Injection"
              subtitle="Inject custom CSS, tracking tags, and modify global palette accents."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <ColorField
                label="Accent Gold"
                value={config.colorAccentGold}
                onChange={(v) => updateField("colorAccentGold", v)}
              />
              <ColorField
                label="Deep Emerald Surface"
                value={config.colorEmeraldDeep}
                onChange={(v) => updateField("colorEmeraldDeep", v)}
              />
              <ColorField
                label="Dark Green-Black Ground"
                value={config.colorGreenBlack}
                onChange={(v) => updateField("colorGreenBlack", v)}
              />
              <ColorField
                label="Ivory Background Ground"
                value={config.colorBgIvory}
                onChange={(v) => updateField("colorBgIvory", v)}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <ToggleField
                label="Enable Gold Luxury Trailing Cursor"
                checked={config.luxuryCursorEnabled}
                onChange={(v) => updateField("luxuryCursorEnabled", v)}
                desc="Interactive trailing cursor dot on desktop devices."
              />
            </div>

            <div
              style={{
                borderTop: "1px solid var(--md-rule)",
                paddingTop: 20,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <TextAreaField
                label="Custom CSS Injection"
                value={config.customCss}
                onChange={(v) => updateField("customCss", v)}
                rows={6}
                desc="Injected directly into storefront <head> as a <style> block for immediate visual tweaks."
              />
              <TextAreaField
                label="Custom <head> HTML / Scripts"
                value={config.customHeadHtml}
                onChange={(v) => updateField("customHeadHtml", v)}
                rows={6}
                desc="Injected into <head>. Ideal for Google Tag Manager, Meta Pixel, or search engine verification meta tags."
              />
              <TextAreaField
                label="Custom Body Footer Scripts"
                value={config.customBodyScripts}
                onChange={(v) => updateField("customBodyScripts", v)}
                rows={6}
                desc="Injected just before closing </body> tag. Ideal for external chat widgets or conversion pixels."
              />
            </div>
          </div>
        )}

        {/* TAB 10: POLICIES & NOTICES */}
        {activeTab === "policies" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Store Notices, Seasonal Announcements & Policies"
              subtitle="Configure emergency banners, holiday notices, and maintenance switches."
            />

            <div
              style={{
                border: "1px solid var(--md-rule)",
                borderRadius: 4,
                padding: 20,
                background: "var(--md-bg-subtle)",
              }}
            >
              <h4 style={{ margin: "0 0 12px", fontSize: "0.9375rem" }}>
                Seasonal / Holiday Announcement Modal
              </h4>
              <ToggleField
                label="Enable Seasonal Announcement Modal"
                checked={config.seasonalNoticeEnabled}
                onChange={(v) => updateField("seasonalNoticeEnabled", v)}
                desc="Renders an elegant modal popup for special occasions, exhibitions, or holidays."
              />
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 16,
                }}
              >
                <InputField
                  label="Modal Title"
                  value={config.seasonalNoticeTitle}
                  onChange={(v) => updateField("seasonalNoticeTitle", v)}
                />
                <ToggleField
                  label="Dismissible by User"
                  checked={config.seasonalNoticeDismissible}
                  onChange={(v) => updateField("seasonalNoticeDismissible", v)}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <TextAreaField
                  label="Modal Announcement Message"
                  value={config.seasonalNoticeMessage}
                  onChange={(v) => updateField("seasonalNoticeMessage", v)}
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              <InputField
                label="Insured Delivery Promise Notice"
                value={config.deliveryPromiseText}
                onChange={(v) => updateField("deliveryPromiseText", v)}
              />
              <InputField
                label="Return &amp; Exchange Policy Summary"
                value={config.returnPolicySummary}
                onChange={(v) => updateField("returnPolicySummary", v)}
              />
            </div>

            <div style={{ borderTop: "1px solid var(--md-rule)", paddingTop: 20 }}>
              <h4
                style={{ margin: "0 0 12px", fontSize: "0.9375rem", color: "var(--md-danger)" }}
              >
                Emergency Maintenance Mode
              </h4>
              <ToggleField
                label="Enable Storefront Maintenance Mode"
                checked={config.maintenanceModeEnabled}
                onChange={(v) => updateField("maintenanceModeEnabled", v)}
                desc="Displays a polite maintenance notice to public visitors while preserving admin access."
              />
              {config.maintenanceModeEnabled && (
                <div style={{ marginTop: 12 }}>
                  <TextAreaField
                    label="Maintenance Notice Copy"
                    value={config.maintenanceModeMessage}
                    onChange={(v) => updateField("maintenanceModeMessage", v)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 11: SEO & SOCIAL SHARE DEFAULTS */}
        {activeTab === "seo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader
              title="Global SEO & Social Share Defaults"
              subtitle="Define default meta tags, title formats, and social share previews."
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              <InputField
                label="Global Title Template (%s = page name)"
                value={config.seoGlobalTitleTemplate}
                onChange={(v) => updateField("seoGlobalTitleTemplate", v)}
              />
              <InputField
                label="Default OpenGraph Image URL"
                value={config.seoDefaultOgImage}
                onChange={(v) => updateField("seoDefaultOgImage", v)}
              />
              <InputField
                label="Twitter / X Site Handle"
                value={config.seoTwitterHandle}
                onChange={(v) => updateField("seoTwitterHandle", v)}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
              <TextAreaField
                label="Default Meta Description (US & International)"
                value={config.seoDefaultDescriptionUs}
                onChange={(v) => updateField("seoDefaultDescriptionUs", v)}
              />
              <TextAreaField
                label="Default Meta Description (India Market)"
                value={config.seoDefaultDescriptionIn}
                onChange={(v) => updateField("seoDefaultDescriptionIn", v)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── REUSABLE FORM COMPONENTS ──────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--md-rule)", paddingBottom: 16 }}>
      <h2
        style={{
          margin: 0,
          fontSize: "1.25rem",
          fontFamily: "var(--md-font-display)",
          color: "var(--md-fg)",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
        {subtitle}
      </p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  desc,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  desc?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 12px",
          borderRadius: 4,
          border: "1px solid var(--md-rule)",
          background: "var(--md-bg)",
          color: "var(--md-fg)",
          fontSize: "0.875rem",
        }}
      />
      {desc && (
        <span style={{ fontSize: "0.6875rem", color: "var(--md-fg-muted)" }}>{desc}</span>
      )}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  desc,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  desc?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}>
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 12px",
          borderRadius: 4,
          border: "1px solid var(--md-rule)",
          background: "var(--md-bg)",
          color: "var(--md-fg)",
          fontSize: "0.875rem",
          fontFamily: "monospace",
          lineHeight: 1.4,
          resize: "vertical",
        }}
      />
      {desc && (
        <span style={{ fontSize: "0.6875rem", color: "var(--md-fg-muted)" }}>{desc}</span>
      )}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  desc,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  desc?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 18,
          height: 18,
          marginTop: 2,
          cursor: "pointer",
          accentColor: "var(--md-green-black)",
        }}
      />
      <div>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}>
          {label}
        </div>
        {desc && (
          <div style={{ fontSize: "0.6875rem", color: "var(--md-fg-muted)", marginTop: 2 }}>
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: "1px solid var(--md-rule)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid var(--md-rule)",
            background: "var(--md-bg)",
            color: "var(--md-fg)",
            fontSize: "0.875rem",
            fontFamily: "monospace",
          }}
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "8px 12px",
          borderRadius: 4,
          border: "1px solid var(--md-rule)",
          background: "var(--md-bg)",
          color: "var(--md-fg)",
          fontSize: "0.875rem",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
