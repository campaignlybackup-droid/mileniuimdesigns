"use client";

import React, { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();
  const isIndia = marketCode === "IN";

  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");

      if (data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode); // Autopopulate in dev mode for seamless testing
      }
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
        body: JSON.stringify({ identifier, code, marketCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to verify code");

      const accountUrl = marketCode.toLowerCase() === "us" ? "/account" : `/${marketCode.toLowerCase()}/account`;
      router.push(accountUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 440,
        margin: "80px auto",
        padding: "var(--md-space-8) var(--md-gutter)",
      }}
    >
      <div
        style={{
          background: "var(--md-bg)",
          border: "1px solid var(--md-rule)",
          padding: "var(--md-space-8) var(--md-space-6)",
          borderRadius: "var(--md-radius-sm)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "var(--md-space-6)" }}>
          <p
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--md-green)",
              fontWeight: 600,
              margin: "0 0 var(--md-space-2)",
            }}
          >
            Client Portal
          </p>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2rem",
              margin: 0,
              fontWeight: 500,
              color: "var(--md-fg)",
            }}
          >
            {step === "identifier" ? "Sign In / Register" : "Enter Verification Code"}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--md-fg-secondary)", marginTop: "var(--md-space-2)" }}>
            {step === "identifier"
              ? "Access your private bespoke acquisitions and order history."
              : `We sent a 6-digit code to ${identifier}`}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: "var(--md-bg-subtle, var(--md-rule))",
              border: "1px solid var(--md-rule)",
              color: "var(--md-sold, var(--md-fg))",
              padding: "var(--md-space-3) var(--md-space-4)",
              borderRadius: "var(--md-radius-sm)",
              marginBottom: "var(--md-space-5)",
              fontSize: "0.875rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {devCode && step === "otp" && (
          <div
            style={{
              background: "var(--md-bg-subtle, var(--md-rule))",
              border: "1px solid var(--md-green)",
              color: "var(--md-green)",
              padding: "var(--md-space-2) var(--md-space-3)",
              borderRadius: "var(--md-radius-sm)",
              marginBottom: "var(--md-space-4)",
              fontSize: "0.8125rem",
              textAlign: "center",
            }}
          >
            Dev OTP: <strong>{devCode}</strong>
          </div>
        )}

        {step === "identifier" ? (
          <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                Mobile Number or Email
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={isIndia ? "+91 98200 00000" : "client@example.com"}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid var(--md-rule)",
                  background: "transparent",
                  color: "var(--md-fg)",
                  fontSize: "0.9375rem",
                  borderRadius: "var(--md-radius-sm)",
                }}
              />
            </div>

            <Button type="submit" variant="primary" size="lg" disabled={loading} style={{ width: "100%", marginTop: "var(--md-space-2)" }}>
              {loading ? "Sending Code…" : "Send Verification Code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-4)" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", marginBottom: 6, color: "var(--md-fg-secondary)" }}>
                6-Digit Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "1px solid var(--md-rule)",
                  background: "transparent",
                  color: "var(--md-fg)",
                  fontSize: "1.25rem",
                  letterSpacing: "0.3em",
                  textAlign: "center",
                  borderRadius: "var(--md-radius-sm)",
                }}
              />
            </div>

            <Button type="submit" variant="primary" size="lg" disabled={loading || code.length < 4} style={{ width: "100%", marginTop: "var(--md-space-2)" }}>
              {loading ? "Verifying…" : "Sign In"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("identifier");
                setCode("");
                setError(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--md-fg-secondary)",
                fontSize: "0.8125rem",
                cursor: "pointer",
                textAlign: "center",
                marginTop: "var(--md-space-2)",
              }}
            >
              Use a different mobile number or email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
