import { describe, expect, it, beforeAll } from "vitest";
import {
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCodes,
  provisioningUri,
  stepFor,
  generateCode,
  verifyTotp,
} from "@/lib/auth/totp";

/** Commissioned by 07 §1.5 and §1.9. */
beforeAll(() => {
  process.env["AUTH_SECRET"] = "a".repeat(48);
});

/** Act as the authenticator app. Deriving the code is the only honest way to test
 *  verification — a test that cannot produce a valid one only proves invalid ones fail. */
const codeAt = (secret: string, at: Date): string => generateCode(secret, at);

describe("secret encryption", () => {
  it("round-trips", () => {
    const s = generateSecret();
    const enc = encryptSecret(s);
    expect(enc).not.toContain(s);
    expect(decryptSecret(enc)).toBe(s);
  });

  it("is versioned and self-describing, so AUTH_SECRET can be rotated", () => {
    // Without the version prefix, a rotation locks out every enrolled staff member at
    // once — including every holder of user.manage, which is the permission resetTotp()
    // needs, so the recovery path dies with the same change (07 §1.10).
    const enc = encryptSecret(generateSecret());
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc.split(":")).toHaveLength(4);
  });

  it("is authenticated — tampering is detected, not silently decrypted", () => {
    const enc = encryptSecret(generateSecret());
    const parts = enc.split(":");
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      Buffer.from("evil").toString("base64"),
    ].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("produces a different ciphertext each time — the IV is per encryption", () => {
    const s = generateSecret();
    expect(encryptSecret(s)).not.toBe(encryptSecret(s));
  });

  it("refuses an unrecognised format rather than guessing", () => {
    expect(() => decryptSecret("not-a-ciphertext")).toThrow(/Unrecognised/);
  });
});

describe("code verification", () => {
  const secret = generateSecret();
  const at = new Date("2026-06-01T12:00:00Z");

  it("accepts the current code", () => {
    const code = codeAt(secret, at);
    expect(verifyTotp(secret, code, { at }).ok).toBe(true);
  });

  it("tolerates one step of clock skew in each direction", () => {
    const code = codeAt(secret, at);
    expect(verifyTotp(secret, code, { at: new Date(at.getTime() + 30_000) }).ok).toBe(true);
    expect(verifyTotp(secret, code, { at: new Date(at.getTime() - 30_000) }).ok).toBe(true);
  });

  it("refuses a code two steps away", () => {
    const code = codeAt(secret, at);
    expect(verifyTotp(secret, code, { at: new Date(at.getTime() + 90_000) }).ok).toBe(false);
  });

  it("REFUSES A REPLAY of an already-accepted step", () => {
    // The whole point of users.totp_last_step. Without it a phished or shoulder-surfed
    // code stays valid for up to 90 seconds, which makes the second factor a second
    // field (07 §1.9).
    const code = codeAt(secret, at);
    const first = verifyTotp(secret, code, { at });
    expect(first.ok).toBe(true);
    const replay = verifyTotp(secret, code, { at, lastStep: (first as { step: number }).step });
    expect(replay).toEqual({ ok: false, reason: "replayed" });
  });

  it("refuses an EARLIER step than the last accepted one", () => {
    const code = codeAt(secret, at);
    const step = stepFor(at);
    expect(verifyTotp(secret, code, { at, lastStep: step + 5 })).toEqual({
      ok: false,
      reason: "replayed",
    });
  });

  it("rejects malformed input without touching the secret", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56", "000000x"]) {
      expect(verifyTotp(secret, bad, { at }).ok).toBe(false);
    }
    const malformed = verifyTotp(secret, "abcdef", { at });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.reason).toBe("malformed");
  });

  it("does not accept another account's code", () => {
    const other = generateSecret();
    const code = codeAt(other, at);
    const result = verifyTotp(secret, code, { at });
    // Astronomically unlikely to collide; if it ever does, the test is wrong, not the code.
    expect(result.ok).toBe(false);
  });
});

describe("provisioning URI", () => {
  it("carries the issuer, the account and the parameters an app needs", () => {
    const s = generateSecret();
    const uri = provisioningUri(s, "owner@millenniumdesigns.test");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Millennium%20Designs");
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("generates ten unambiguous codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    for (const c of codes) {
      expect(c).toHaveLength(10);
      // Crockford base32: no I, L, O or U, so a printed code cannot be misread.
      expect(c).not.toMatch(/[ILOU]/);
    }
    expect(new Set(codes).size).toBe(10);
  });

  it("stores hashes, never the codes", async () => {
    const codes = generateRecoveryCodes();
    const hashes = await hashRecoveryCodes(codes);
    for (let i = 0; i < codes.length; i++) {
      expect(hashes[i]).toContain("$argon2");
      expect(hashes[i]).not.toContain(codes[i]!);
    }
  });

  it("consumes a code and SPLICES it out — one that survives its use is just a password", async () => {
    const codes = generateRecoveryCodes();
    const hashes = await hashRecoveryCodes(codes);

    const first = await consumeRecoveryCode(hashes, codes[3]!);
    expect(first.ok).toBe(true);
    expect(first.remaining).toHaveLength(9);

    const replay = await consumeRecoveryCode(first.remaining, codes[3]!);
    expect(replay.ok).toBe(false);
    expect(replay.remaining).toHaveLength(9);
  }, 30_000);

  it("accepts a code typed with spaces or hyphens, in any case", async () => {
    const codes = generateRecoveryCodes();
    const hashes = await hashRecoveryCodes(codes);
    const typed = codes[0]!.toLowerCase().replace(/(.{5})/, "$1-");
    const r = await consumeRecoveryCode(hashes, typed);
    expect(r.ok).toBe(true);
  }, 30_000);

  it("rejects an unknown code without altering the list", async () => {
    const hashes = await hashRecoveryCodes(generateRecoveryCodes());
    const r = await consumeRecoveryCode(hashes, "0000000000");
    expect(r.ok).toBe(false);
    expect(r.remaining).toHaveLength(10);
  }, 30_000);
});
