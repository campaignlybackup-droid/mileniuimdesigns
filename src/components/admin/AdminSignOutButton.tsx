"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminSignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/staff/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch {
      window.location.href = "/admin/login";
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      title="Sign out of Admin Portal"
      style={{
        padding: "4px 10px",
        borderRadius: 4,
        border: "1px solid var(--md-rule, #e7e2d7)",
        background: "#ffffff",
        color: "#991b1b",
        fontSize: "0.75rem",
        fontWeight: 600,
        cursor: loading ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {loading ? "Signing out..." : "Sign Out ↪"}
    </button>
  );
}
