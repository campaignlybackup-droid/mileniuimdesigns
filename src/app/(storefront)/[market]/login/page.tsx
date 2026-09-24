"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Mail, Phone, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();

  const [step, setStep] = useState<"identifier" | "otp">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Automatically detect whether the input is an email or a phone number
  const isEmail = identifier.includes("@");

  // Countdown timer for resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Focus the first OTP box upon entering the OTP step
  useEffect(() => {
    if (step === "otp") {
      const timer = setTimeout(() => {
        otpInputsRef.current[0]?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const clean = identifier.trim();
    if (!clean || clean.length < 4) {
      setError("Please enter a valid email or phone number.");
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
      if (!res.ok) throw new Error(data.error || "Failed to send verification code");

      if (data.devCode) {
        setDevCode(data.devCode);
        const chars = String(data.devCode).slice(0, 6).split("");
        const padded = [...chars, ...Array(6 - chars.length).fill("")].slice(0, 6);
        setOtpDigits(padded);
        setCode(data.devCode);
      } else {
        setOtpDigits(["", "", "", "", "", ""]);
        setCode("");
      }

      setResendCountdown(45);
      setStep("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent, customCode?: string) => {
    if (e) e.preventDefault();
    const codeToVerify = (customCode ?? code).trim();
    if (codeToVerify.length < 6) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), code: codeToVerify, marketCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid verification code");

      const accountUrl =
        marketCode.toLowerCase() === "us" ? "/account" : `/${marketCode.toLowerCase()}/account`;
      router.push(accountUrl);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid code. Please check and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    const raw = val.replace(/\D/g, "");

    // Multi-digit paste or autofill
    if (raw.length > 1) {
      const nextDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        if (index + i < 6 && raw[i]) {
          nextDigits[index + i] = raw[i];
        }
      }
      setOtpDigits(nextDigits);
      const combined = nextDigits.join("");
      setCode(combined);

      const nextFocus = Math.min(index + raw.length, 5);
      otpInputsRef.current[nextFocus]?.focus();

      if (combined.length === 6) {
        handleVerifyOtp(undefined, combined);
      }
      return;
    }

    const nextDigits = [...otpDigits];
    nextDigits[index] = raw;
    setOtpDigits(nextDigits);
    const combined = nextDigits.join("");
    setCode(combined);

    if (raw && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    if (combined.length === 6) {
      handleVerifyOtp(undefined, combined);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        otpInputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const chars = pasted.split("");
    const padded = [...chars, ...Array(6 - chars.length).fill("")].slice(0, 6);
    setOtpDigits(padded);
    setCode(pasted);

    const focusIdx = Math.min(pasted.length, 5);
    otpInputsRef.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      handleVerifyOtp(undefined, pasted);
    }
  };

  return (
    <main
      data-surface="ivory-soft"
      style={{
        minHeight: "calc(100vh - 200px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(36px, 7vw, 72px) var(--md-gutter)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--md-bg-raised)",
          border: "1px solid color-mix(in srgb, var(--md-champagne) 24%, var(--md-rule))",
          borderRadius: "4px",
          boxShadow:
            "0 16px 40px -12px rgba(11, 47, 35, 0.08), 0 2px 8px rgba(0, 0, 0, 0.02)",
          padding: "clamp(32px, 6vw, 44px) clamp(24px, 5vw, 36px)",
        }}
      >
        {/* Simple & Clean Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1
            className="md-editorial-title"
            style={{
              fontSize: "clamp(1.75rem, 3.5vw, 2.125rem)",
              margin: "0 0 8px",
              fontWeight: 400,
              color: "var(--md-fg)",
              letterSpacing: "-0.015em",
            }}
          >
            {step === "identifier" ? "Sign In" : "Enter Code"}
          </h1>

          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--md-fg-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {step === "identifier" ? (
              "Enter your email or phone number to continue"
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                <span>Code sent to</span>
                <strong style={{ color: "var(--md-fg)", fontWeight: 600 }}>
                  {identifier}
                </strong>
                <button
                  type="button"
                  onClick={() => {
                    setStep("identifier");
                    setError(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--md-gold-antique)",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                  }}
                >
                  Edit
                </button>
              </span>
            )}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background:
                "color-mix(in srgb, var(--md-danger) 9%, var(--md-bg-raised))",
              border:
                "1px solid color-mix(in srgb, var(--md-danger) 28%, transparent)",
              color: "var(--md-danger)",
              padding: "10px 14px",
              borderRadius: "4px",
              marginBottom: 20,
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* STEP 1: Single Unified Input (Auto-detects Email or Phone) */}
        {step === "identifier" ? (
          <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label
                htmlFor="login-identifier"
                style={{
                  display: "block",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "var(--md-fg)",
                }}
              >
                Email or phone number
              </label>

              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: "var(--md-fg-muted)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {isEmail ? (
                    <Mail style={{ width: 16, height: 16, color: "var(--md-emerald-deep)" }} />
                  ) : (
                    <Phone style={{ width: 16, height: 16 }} />
                  )}
                </div>

                <input
                  id="login-identifier"
                  type="text"
                  required
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@gmail.com or +91 98290 56597"
                  style={{
                    width: "100%",
                    padding: "13px 14px 13px 40px",
                    border: "1px solid var(--md-rule-strong)",
                    background: "var(--md-bg)",
                    color: "var(--md-fg)",
                    fontSize: "0.9375rem",
                    borderRadius: "4px",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 150ms ease",
                  }}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                  <span>Sending code…</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight style={{ width: 15, height: 15 }} />
                </>
              )}
            </Button>
          </form>
        ) : (
          /* STEP 2: 6-Digit OTP Verification */
          <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: 8,
                }}
                onPaste={handleOtpPaste}
              >
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpInputsRef.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={idx === 0 ? 6 : 1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    style={{
                      width: "100%",
                      height: 52,
                      textAlign: "center",
                      fontSize: "1.375rem",
                      fontWeight: 700,
                      fontFamily:
                        "-apple-system, BlinkMacSystemFont, 'SF Mono', monospace",
                      color: "var(--md-fg)",
                      background: "var(--md-bg)",
                      border: digit
                        ? "1.5px solid var(--md-emerald-deep)"
                        : "1px solid var(--md-rule-strong)",
                      borderRadius: "4px",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "all 140ms ease",
                    }}
                    autoComplete={idx === 0 ? "one-time-code" : "off"}
                  />
                ))}
              </div>
            </div>

            {/* Dev helper tag (only shown in development mode) */}
            {devCode && (
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    const chars = String(devCode).slice(0, 6).split("");
                    setOtpDigits(chars);
                    setCode(devCode);
                    handleVerifyOtp(undefined, devCode);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px dashed var(--md-champagne)",
                    color: "var(--md-gold-antique)",
                    fontSize: "0.75rem",
                    padding: "4px 10px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  <span>Dev code: <strong>{devCode}</strong> (tap to fill)</span>
                </button>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={loading || code.trim().length < 6}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                  <span>Signing In…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight style={{ width: 15, height: 15 }} />
                </>
              )}
            </Button>

            {/* Resend Link */}
            <div style={{ textAlign: "center" }}>
              {resendCountdown > 0 ? (
                <span style={{ fontSize: "0.8125rem", color: "var(--md-fg-muted)" }}>
                  Resend code in {resendCountdown}s
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
                  Didn&apos;t receive code? Resend
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
