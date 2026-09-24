"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/Logo";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed. Please verify credentials.");
      }

      router.push("/admin");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to deliver security OTP.");
      }

      setOtpSent(true);
      setInfo(`A 6-digit verification code has been dispatched to ${email}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid or expired OTP code.");
      }

      router.push("/admin");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #fdfcf9 0%, #f4f0e8 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.07), 0 0 1px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e7e2d7",
          padding: "40px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Brand Crest */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Logo variant="monogram" tone="green" size="md" />
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "#182c23",
              margin: 0,
            }}
          >
            Millennium Admin
          </h1>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6e6b63" }}>
            Store Administration & Management Portal
          </p>
        </div>

        {/* Tab switch between Password & OTP */}
        <div
          style={{
            display: "flex",
            background: "#f4f1ea",
            padding: 4,
            borderRadius: 8,
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
              setInfo(null);
            }}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "none",
              borderRadius: 6,
              background: mode === "password" ? "#ffffff" : "transparent",
              color: mode === "password" ? "#182c23" : "#6e6b63",
              fontWeight: mode === "password" ? 600 : 500,
              fontSize: "0.825rem",
              cursor: "pointer",
              boxShadow: mode === "password" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            Password Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("otp");
              setError(null);
              setInfo(null);
            }}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "none",
              borderRadius: 6,
              background: mode === "otp" ? "#ffffff" : "transparent",
              color: mode === "otp" ? "#182c23" : "#6e6b63",
              fontWeight: mode === "otp" ? 600 : 500,
              fontSize: "0.825rem",
              cursor: "pointer",
              boxShadow: mode === "otp" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.2s ease",
            }}
          >
            Email OTP Login
          </button>
        </div>

        {/* Feedback message boxes */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#fdf2f2",
              border: "1px solid #f8b4b4",
              color: "#991b1b",
              fontSize: "0.825rem",
            }}
          >
            {error}
          </div>
        )}

        {info && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontSize: "0.825rem",
            }}
          >
            {info}
          </div>
        )}

        {/* Mode: Password Login */}
        {mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#3f3d38",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Administrator Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="anshbhatt0902@gmail.com"
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #d5cfc1",
                  fontSize: "0.925rem",
                  background: "#faf9f6",
                  color: "#1c1b18",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#3f3d38",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid #d5cfc1",
                  fontSize: "0.925rem",
                  background: "#faf9f6",
                  color: "#1c1b18",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: "#182c23",
                color: "#ffffff",
                fontSize: "0.925rem",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 2px 6px rgba(24, 44, 35, 0.2)",
              }}
            >
              {loading ? "Authenticating..." : "Sign In to CMS Portal"}
            </button>
          </form>
        ) : (
          /* Mode: OTP Login */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#3f3d38",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Staff Email Address
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="anshbhatt0902@gmail.com"
                  disabled={otpSent}
                  required
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid #d5cfc1",
                    fontSize: "0.925rem",
                    background: otpSent ? "#f4f1ea" : "#faf9f6",
                    color: "#1c1b18",
                    outline: "none",
                  }}
                />
                {!otpSent ? (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={loading || !email}
                    style={{
                      padding: "0 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#182c23",
                      color: "#ffffff",
                      fontSize: "0.825rem",
                      fontWeight: 600,
                      cursor: loading ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Send OTP
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                    }}
                    style={{
                      padding: "0 12px",
                      borderRadius: 8,
                      border: "1px solid #d5cfc1",
                      background: "#ffffff",
                      color: "#6e6b63",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {otpSent && (
              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#3f3d38",
                      marginBottom: 6,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    6-Digit Security Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: 8,
                      border: "1px solid #d5cfc1",
                      fontSize: "1.25rem",
                      letterSpacing: "0.3em",
                      textAlign: "center",
                      fontWeight: 700,
                      background: "#faf9f6",
                      color: "#182c23",
                      outline: "none",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: "#182c23",
                    color: "#ffffff",
                    fontSize: "0.925rem",
                    fontWeight: 600,
                    cursor: loading || otpCode.length !== 6 ? "not-allowed" : "pointer",
                    opacity: loading || otpCode.length !== 6 ? 0.6 : 1,
                    boxShadow: "0 2px 6px rgba(24, 44, 35, 0.2)",
                  }}
                >
                  {loading ? "Verifying..." : "Verify & Access Admin"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer info */}
        <div style={{ textAlign: "center", paddingTop: 8, borderTop: "1px solid #f0ebe1" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#8a857b" }}>
            Millennium Designs Silver E-Commerce CMS · Strict Authentication Required
          </p>
        </div>
      </div>
    </div>
  );
}
