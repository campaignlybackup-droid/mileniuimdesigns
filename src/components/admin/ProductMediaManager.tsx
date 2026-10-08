"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";

export type ProductMediaItem = {
  id: string; // productMediaId or mediaId
  mediaId: string;
  publicId: string;
  url: string;
  format?: string;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  role: string;
  position: number;
};

type Props = {
  productId?: string;
  initialMedia?: ProductMediaItem[];
  onChange?: (media: ProductMediaItem[]) => void;
};

export function ProductMediaManager({
  productId,
  initialMedia = [],
  onChange,
}: Props) {
  const [media, setMedia] = useState<ProductMediaItem[]>(initialMedia);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlAltInput, setUrlAltInput] = useState("");
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [editingAltId, setEditingAltId] = useState<string | null>(null);
  const [altTextDraft, setAltTextDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update both local state and parent callback
  const updateMediaState = (updated: ProductMediaItem[]) => {
    setMedia(updated);
    if (onChange) {
      onChange(updated);
    }
  };

  // Sync initialMedia updates from parent
  React.useEffect(() => {
    if (initialMedia && initialMedia.length > 0 && media.length === 0) {
      setMedia(initialMedia);
    }
  }, [initialMedia]);

  // Handle file uploads (drag-drop or file picker)
  async function handleFiles(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    setUploadProgress(`Uploading ${files.length} photo(s) to Cloudinary...`);

    const formData = new FormData();
    if (productId) {
      formData.append("productId", productId);
    }
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]!);
    }

    try {
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to upload image(s).");
      }

      const uploadedList: ProductMediaItem[] = (data.media || []).map((m: any, idx: number) => ({
        id: m.id || m.mediaId,
        mediaId: m.mediaId || m.id,
        publicId: m.publicId,
        url: m.url,
        format: m.format,
        width: m.width,
        height: m.height,
        altText: m.altText || "",
        role: media.length === 0 && idx === 0 ? "hero" : "gallery",
        position: media.length + idx,
      }));

      const newMedia = [...media, ...uploadedList];
      // Ensure first item is hero if none exists
      if (!newMedia.some((item) => item.role === "hero") && newMedia.length > 0) {
        newMedia[0]!.role = "hero";
      }

      updateMediaState(newMedia);
      setSuccess(`Successfully uploaded ${uploadedList.length} photo(s)!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error uploading photos.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Handle direct Image URL upload
  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setError(null);
    setUploading(true);
    setUploadProgress("Fetching and saving image from URL...");

    try {
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput.trim(),
          altText: urlAltInput.trim() || undefined,
          productId,
          role: media.length === 0 ? "hero" : "gallery",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to add image from URL.");
      }

      const added: ProductMediaItem = {
        id: data.media[0].id || data.media[0].mediaId,
        mediaId: data.media[0].mediaId,
        publicId: data.media[0].publicId,
        url: data.media[0].url,
        format: data.media[0].format,
        width: data.media[0].width,
        height: data.media[0].height,
        altText: data.media[0].altText || urlAltInput.trim() || "",
        role: media.length === 0 ? "hero" : "gallery",
        position: media.length,
      };

      const newMedia = [...media, added];
      updateMediaState(newMedia);
      setUrlInput("");
      setUrlAltInput("");
      setShowUrlModal(false);
      setSuccess("Image URL added successfully!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add image URL.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  // Set an image as the Primary / Hero photo
  async function handleSetHero(index: number) {
    if (index === 0 && media[0]?.role === "hero") return;

    const target = media[index];
    if (!target) return;

    const remaining = media.filter((_, i) => i !== index);
    const reordered = [
      { ...target, role: "hero", position: 0 },
      ...remaining.map((item, i) => ({
        ...item,
        role: item.role === "hero" ? "gallery" : item.role,
        position: i + 1,
      })),
    ];

    updateMediaState(reordered);

    // If editing existing product, persist order change immediately
    if (productId) {
      await persistReorder(reordered);
    }
  }

  // Move an image left/right (up/down) in the sequence
  async function handleMove(index: number, direction: "prev" | "next") {
    const targetIdx = direction === "prev" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= media.length) return;

    const copy = [...media];
    const temp = copy[index]!;
    copy[index] = copy[targetIdx]!;
    copy[targetIdx] = temp;

    // Recalculate positions & hero
    const updated = copy.map((item, idx) => ({
      ...item,
      position: idx,
      role: idx === 0 ? "hero" : item.role === "hero" ? "gallery" : item.role,
    }));

    updateMediaState(updated);

    if (productId) {
      await persistReorder(updated);
    }
  }

  // Change role of an image
  async function handleRoleChange(index: number, newRole: string) {
    const copy = [...media];
    copy[index] = { ...copy[index]!, role: newRole };
    updateMediaState(copy);

    if (productId) {
      await persistReorder(copy);
    }
  }

  // Save alt text
  async function handleSaveAlt(id: string) {
    const copy = media.map((m) => (m.id === id ? { ...m, altText: altTextDraft } : m));
    updateMediaState(copy);
    setEditingAltId(null);

    if (productId) {
      await persistReorder(copy);
    }
  }

  // Remove a photo
  async function handleRemove(id: string, index: number) {
    if (!confirm("Are you sure you want to remove this photo from the product?")) {
      return;
    }

    if (productId) {
      try {
        const res = await fetch(
          `/api/admin/products/${productId}/media?productMediaId=${id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Failed to remove photo");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error deleting photo");
        return;
      }
    }

    const filtered = media
      .filter((m) => m.id !== id)
      .map((item, idx) => ({
        ...item,
        position: idx,
        role: idx === 0 ? "hero" : item.role,
      }));

    updateMediaState(filtered);
    setSuccess("Photo removed.");
    setTimeout(() => setSuccess(null), 3000);
  }

  // Persist reorder to database
  async function persistReorder(items: ProductMediaItem[]) {
    try {
      await fetch(`/api/admin/products/${productId}/media`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((m) => ({
            id: m.id,
            position: m.position,
            role: m.role,
            altText: m.altText,
          })),
        }),
      });
    } catch (e) {
      console.error("Failed to persist media ordering:", e);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header with Counter and Add Options */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#182c23", display: "flex", alignItems: "center", gap: 8 }}>
            <span>📸</span>
            <span>Product Photography &amp; Gallery</span>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 4,
                background: media.length > 0 ? "#e8f5e9" : "#f0ebe1",
                color: media.length > 0 ? "#2e7d32" : "#6e6b63",
                fontWeight: 700,
              }}
            >
              {media.length} {media.length === 1 ? "Photo" : "Photos"}
            </span>
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#6e6b63" }}>
            High-resolution silver jewellery photos delivered via Cloudinary CDN. The first photo is the <strong>Hero</strong> shown on search, collections, and primary PDP view.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "none",
              background: "#182c23",
              color: "#ffffff",
              fontSize: "0.825rem",
              fontWeight: 600,
              cursor: uploading ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 4px rgba(24, 44, 35, 0.15)",
            }}
          >
            <span>↑</span>
            <span>Upload Photos</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlModal(!showUrlModal)}
            disabled={uploading}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              border: "1px solid #d5cfc1",
              background: "#ffffff",
              color: "#182c23",
              fontSize: "0.825rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🔗</span>
            <span>Add by Image URL</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
            }}
          />
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 6, background: "#fdf2f2", border: "1px solid #f8b4b4", color: "#991b1b", fontSize: "0.825rem" }}>
          ✕ {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "10px 14px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "0.825rem" }}>
          ✓ {success}
        </div>
      )}

      {/* Uploading progress indicator */}
      {uploading && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 6,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
          <span>{uploadProgress || "Uploading to Cloudinary..."}</span>
        </div>
      )}

      {/* Add by URL Drawer / Form */}
      {showUrlModal && (
        <form
          onSubmit={handleAddUrl}
          style={{
            padding: "16px",
            background: "#faf8f4",
            border: "1px solid #e7e2d7",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#182c23" }}>
            Add Image from External URL or CDN
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/images/jewellery-ring.jpg"
              required
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d5cfc1",
                fontSize: "0.85rem",
                background: "#ffffff",
              }}
            />
            <input
              type="text"
              value={urlAltInput}
              onChange={(e) => setUrlAltInput(e.target.value)}
              placeholder="SEO Alt Description (optional)"
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d5cfc1",
                fontSize: "0.85rem",
                background: "#ffffff",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowUrlModal(false)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d5cfc1",
                background: "#ffffff",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !urlInput.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "#182c23",
                color: "#ffffff",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add Photo
            </button>
          </div>
        </form>
      )}

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? "2px dashed #182c23" : "2px dashed #d5cfc1",
          borderRadius: 8,
          padding: media.length === 0 ? "36px 20px" : "18px 20px",
          background: isDragging ? "#f0f7f3" : "#faf9f6",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ fontSize: "1.75rem", marginBottom: 6 }}>
          {isDragging ? "📥" : "📸"}
        </div>
        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#182c23" }}>
          {isDragging
            ? "Drop photos here to upload"
            : media.length === 0
            ? "Drag and drop product photos here, or click to browse"
            : "Drag more photos here or click to browse additional angles"}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#8a857b", marginTop: 4 }}>
          Supports JPG, PNG, WebP, AVIF up to 15MB each · Automatic Cloudinary optimization
        </div>
      </div>

      {/* Gallery Cards Grid */}
      {media.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 16,
            marginTop: 4,
          }}
        >
          {media.map((item, idx) => {
            const isHero = item.role === "hero" || idx === 0;
            const isEditingAlt = editingAltId === item.id;

            return (
              <div
                key={item.id || item.mediaId || idx}
                style={{
                  background: "#ffffff",
                  border: isHero ? "2px solid #182c23" : "1px solid #e7e2d7",
                  borderRadius: 8,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  boxShadow: isHero ? "0 4px 12px rgba(24, 44, 35, 0.1)" : "0 1px 4px rgba(0,0,0,0.04)",
                  transition: "all 0.15s ease",
                }}
              >
                {/* 4:5 Aspect Ratio Image Thumbnail Container */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "4 / 5",
                    background: "#f4f1ea",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.altText || `Product view ${idx + 1}`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />

                  {/* Badges on Thumbnail */}
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      display: "flex",
                      gap: 4,
                      zIndex: 2,
                    }}
                  >
                    {isHero ? (
                      <span
                        style={{
                          background: "#182c23",
                          color: "#ffffff",
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 4,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <span>👑</span> Primary Hero
                      </span>
                    ) : (
                      <span
                        style={{
                          background: "rgba(0,0,0,0.65)",
                          color: "#ffffff",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        #{idx + 1}
                      </span>
                    )}
                  </div>

                  {/* Format & Dimensions tag */}
                  {(item.width || item.format) && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.6)",
                        color: "#ffffff",
                        fontSize: "0.65rem",
                        padding: "2px 5px",
                        borderRadius: 3,
                      }}
                    >
                      {item.format?.toUpperCase()} {item.width ? `${item.width}×${item.height}` : ""}
                    </div>
                  )}
                </div>

                {/* Card Controls & Details */}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "space-between" }}>
                  <div>
                    {/* Role Selector & Position */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: "0.725rem", fontWeight: 600, color: "#6e6b63", textTransform: "uppercase" }}>
                        Role:
                      </span>
                      <select
                        value={item.role}
                        onChange={(e) => handleRoleChange(idx, e.target.value)}
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "1px solid #d5cfc1",
                          background: "#faf9f6",
                          color: "#182c23",
                          fontWeight: 600,
                        }}
                      >
                        <option value="hero">Hero (Primary)</option>
                        <option value="gallery">Gallery Angle</option>
                        <option value="detail">Close-Up Detail</option>
                        <option value="lifestyle">Lifestyle / Model</option>
                        <option value="mobile">Mobile View</option>
                      </select>
                    </div>

                    {/* Alt text display / editing */}
                    {isEditingAlt ? (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <input
                          type="text"
                          value={altTextDraft}
                          onChange={(e) => setAltTextDraft(e.target.value)}
                          placeholder="Image alt description"
                          style={{
                            flex: 1,
                            fontSize: "0.75rem",
                            padding: "4px 6px",
                            borderRadius: 4,
                            border: "1px solid #182c23",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveAlt(item.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "none",
                            background: "#182c23",
                            color: "#fff",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingAltId(item.id);
                          setAltTextDraft(item.altText || "");
                        }}
                        title="Click to edit alt text"
                        style={{
                          fontSize: "0.75rem",
                          color: item.altText ? "#3f3d38" : "#9ca3af",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          padding: "2px 0",
                          fontStyle: item.altText ? "normal" : "italic",
                        }}
                      >
                        {item.altText || "+ Add SEO Alt Text"}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 8,
                      borderTop: "1px solid #f0ebe1",
                    }}
                  >
                    {/* Make Hero button */}
                    {!isHero ? (
                      <button
                        type="button"
                        onClick={() => handleSetHero(idx)}
                        title="Make this the Primary Hero photo"
                        style={{
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: "1px solid #d5cfc1",
                          background: "#ffffff",
                          color: "#182c23",
                          fontSize: "0.725rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ★ Set Hero
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.725rem", color: "#2e7d32", fontWeight: 700 }}>
                        ✓ Primary
                      </span>
                    )}

                    {/* Reorder and Delete buttons */}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, "prev")}
                        disabled={idx === 0}
                        title="Move left"
                        style={{
                          padding: "3px 6px",
                          borderRadius: 4,
                          border: "1px solid #d5cfc1",
                          background: "#ffffff",
                          fontSize: "0.7rem",
                          cursor: idx === 0 ? "not-allowed" : "pointer",
                          opacity: idx === 0 ? 0.3 : 1,
                        }}
                      >
                        ◀
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMove(idx, "next")}
                        disabled={idx === media.length - 1}
                        title="Move right"
                        style={{
                          padding: "3px 6px",
                          borderRadius: 4,
                          border: "1px solid #d5cfc1",
                          background: "#ffffff",
                          fontSize: "0.7rem",
                          cursor: idx === media.length - 1 ? "not-allowed" : "pointer",
                          opacity: idx === media.length - 1 ? 0.3 : 1,
                        }}
                      >
                        ▶
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(item.id, idx)}
                        title="Remove photo"
                        style={{
                          padding: "3px 6px",
                          borderRadius: 4,
                          border: "1px solid #fecaca",
                          background: "#fef2f2",
                          color: "#b91c1c",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
