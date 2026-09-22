"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();
  const isIndia = marketCode === "IN";

  const [authMode, setAuthMode] = useState<"email" | "whatsapp">("email");
  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  // Timer countdown for resend button
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessInfo(null);

    const clean = identifier.trim();
    if (!clean || clean.length < 4) {
      setError(
        authMode === "email"
          ? "Please enter a valid email address (e.g. name@gmail.com)"
          : "Please enter a valid WhatsApp mobile number with country code (e.g. +91 98281 56465)",
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: clean }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");

      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode); // Autopopulate in dev mode for testing
      }

      setSuccessInfo(
        data.channel === "email"
          ? data.emailSent
            ? `A 6-digit code has been sent directly to your Gmail inbox (${clean}). Please check your inbox or spam.`
            : `A single-use verification code has been generated for ${clean}.`
          : `Verification code initiated for WhatsApp ${clean}.`,
      );

      setResendCountdown(60);
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code: code.trim(), marketCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify code");

      const accountUrl =
        marketCode.toLowerCase() === "us" ? "/account" : `/${marketCode.toLowerCase()}/account`;
      router.push(accountUrl);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid verification code. Please check and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "clamp(40px, 8vw, 90px) auto",
        padding: "0 var(--md-gutter)",
      }}
    >
      <div
        style={{
          background: "var(--md-bg-raised)",
          border: "1px solid var(--md-rule)",
          padding: "clamp(24px, 5vw, 40px)",
          borderRadius: "var(--md-radius-sm)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.06)",
        }}
      >
        {/* Atelier Crest & Branding */}
        <div style={{ textAlign: "center", marginBottom: "var(--md-space-6)" }}>
          <span
            style={{
              fontSize: "0.6875rem",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "var(--md-gold)",
              fontWeight: 600,
              display: "block",
              marginBottom: 8,
            }}
          >
            ✦ JOHARI BAZAAR, JAIPUR · EST. 1961 ✦
          </span>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
              margin: 0,
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.01em",
            }}
          >
            {step === "identifier" ? "Client Vault Access" : "Enter Verification Code"}
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--md-fg-secondary)",
              marginTop: "var(--md-space-2)",
              lineHeight: 1.5,
            }}
          >
            {step === "identifier"
              ? "Sign in with your email or WhatsApp number to view reserved bespoke creations, orders, and certificates."
              : `A 6-digit access code was dispatched for ${identifier}`}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--md-danger) 10%, var(--md-bg-raised))",
              border: "1px solid color-mix(in srgb, var(--md-danger) 30%, transparent)",
              color: "var(--md-danger)",
              padding: "12px 16px",
              borderRadius: "var(--md-radius-sm)",
              marginBottom: "var(--md-space-4)",
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Success / Dispatched Info */}
        {successInfo && (
          <div
            style={{
              background: "color-mix(in srgb, var(--md-gold) 12%, var(--md-bg-raised))",
              border: "1px solid color-mix(in srgb, var(--md-gold) 35%, transparent)",
              color: "var(--md-fg)",
              padding: "12px 16px",
              borderRadius: "var(--md-radius-sm)",
              marginBottom: "var(--md-space-4)",
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {successInfo}
          </div>
        )}

        {/* Dev Code Quick-Fill Badge */}
        {devCode && step === "otp" && (
          <div
            style={{
              background: "var(--md-bg)",
              border: "1px dashed var(--md-gold)",
              padding: "8px 12px",
              borderRadius: "var(--md-radius-sm)",
              marginBottom: "var(--md-space-4)",
              fontSize: "0.8125rem",
              textAlign: "center",
              color: "var(--md-fg)",
            }}
          >
            Development Testing Code:{" "}
            <strong style={{ letterSpacing: "0.15em", color: "var(--md-gold)" }}>
              {devCode}
            </strong>
          </div>
        )}

        {step === "identifier" ? (
          <div>
            {/* Mode Switcher Tabs: Email vs WhatsApp */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                background: "var(--md-bg)",
                padding: 4,
                borderRadius: "var(--md-radius-sm)",
                marginBottom: "var(--md-space-5)",
                border: "1px solid var(--md-rule)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setAuthMode("email");
                  setError(null);
                }}
                style={{
                  padding: "10px 14px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "calc(var(--md-radius-sm) - 2px)",
                  cursor: "pointer",
                  background: authMode === "email" ? "var(--md-bg-raised)" : "transparent",
                  color: authMode === "email" ? "var(--md-fg)" : "var(--md-fg-muted)",
                  boxShadow: authMode === "email" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  transition: "all 150ms ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>✉</span>
                <span>Gmail / Email</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode("whatsapp");
                  setError(null);
                }}
                style={{
                  padding: "10px 14px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "calc(var(--md-radius-sm) - 2px)",
                  cursor: "pointer",
                  background: authMode === "whatsapp" ? "var(--md-bg-raised)" : "transparent",
                  color: authMode === "whatsapp" ? "var(--md-fg)" : "var(--md-fg-muted)",
                  boxShadow: authMode === "whatsapp" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  transition: "all 150ms ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>📱</span>
                <span>WhatsApp</span>
              </button>
            </div>

            <form
              onSubmit={handleSendOtp}
              style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    marginBottom: 8,
                    color: "var(--md-fg)",
                  }}
                >
                  {authMode === "email" ? "Your Email Address" : "Your WhatsApp Mobile Number"}
                </label>
                <input
                  type={authMode === "email" ? "email" : "text"}
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    // Smart auto-detection if pasted/typed
                    if (e.target.value.includes("@") && authMode !== "email") {
                      setAuthMode("email");
                    }
                  }}
                  placeholder={
                    authMode === "email"
                      ? "client@gmail.com"
                      : isIndia
                        ? "+91 98281 56465"
                        : "+1 (555) 019-2834"
                  }
                  style={{
                    width: "100%",
                    padding: "13px 15px",
                    border: "1px solid var(--md-rule)",
                    background: "var(--md-bg)",
                    color: "var(--md-fg)",
                    fontSize: "0.9375rem",
                    borderRadius: "var(--md-radius-sm)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <span
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "var(--md-fg-muted)",
                    marginTop: 6,
                  }}
                >
                  {authMode === "email"
                    ? "✦ A 6-digit verification code will be sent to your Gmail/email inbox."
                    : "✦ Enter your number with country code (e.g. +91 for India, +1 for US)."}
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={loading}
                style={{ width: "100%", marginTop: "var(--md-space-2)" }}
              >
                {loading ? "Dispatching Code…" : "Send Verification Code →"}
              </Button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <label
                  style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--md-fg)" }}
                >
                  Enter 6-Digit Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep("identifier");
                    setCode("");
                    setError(null);
                    setSuccessInfo(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "0.75rem",
                    color: "var(--md-gold)",
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Edit destination
                </button>
              </div>

              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "1.5px solid var(--md-gold)",
                  background: "var(--md-bg)",
                  color: "var(--md-fg)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: "0.35em",
                  textAlign: "center",
                  borderRadius: "var(--md-radius-sm)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading || code.trim().length < 6}
              style={{ width: "100%", marginTop: "var(--md-space-2)" }}
            >
              {loading ? "Verifying Vault Access…" : "Access Client Vault →"}
            </Button>

            {/* Resend Code Action */}
            <div style={{ textAlign: "center", marginTop: 8 }}>
              {resendCountdown > 0 ? (
                <span style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
                  Resend code available in {resendCountdown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "0.8125rem",
                    color: "var(--md-fg)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Did not receive code? Resend verification code
                </button>
              )}
            </div>
          </form>
        )}

        {/* Security & Provenance Footnote */}
        <div
          style={{
            marginTop: "var(--md-space-6)",
            paddingTop: "var(--md-space-4)",
            borderTop: "1px solid var(--md-rule)",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "var(--md-fg-muted)",
            lineHeight: 1.5,
          }}
        >
          🔒 Encrypted 256-bit single-use code · No permanent passwords required.
          <br />
          Need assistance? Contact our Jaipur atelier concierge on{" "}
          <Link
            href="https://wa.me/919828156465?text=Hello%20Millennium%20Designs%20concierge,%20I%20need%20assistance%20signing%20in%20to%20my%20client%20portal."
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--md-gold)", textDecoration: "underline" }}
          >
            WhatsApp (+91 98281 56465)
          </Link>
        </div>
      </div>
    </div>
  );
}
