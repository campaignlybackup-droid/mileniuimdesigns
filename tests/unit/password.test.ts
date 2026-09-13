import { describe, expect, it } from "vitest";
import { ARGON2_PARAMS, hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import {
  formatLinkToken,
  generateNumericCode,
  generateToken,
  hashToken,
  parseLinkToken,
  tokensEqual,
} from "@/lib/auth/tokens";

/** Commissioned by 07 §1.4 and §1.5. */
describe("password hashing", () => {
  it("actually produces argon2id — not argon2i or argon2d", () => {
    // ARGON2_PARAMS.algorithm is the literal 2 because `Algorithm` is an ambient const
    // enum that isolatedModules forbids importing. This asserts the literal is right; a
    // wrong constant would silently give a weaker algorithm.
    expect(ARGON2_PARAMS.algorithm).toBe(2);
  });

  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(h, "Correct horse battery staple")).toBe(false);
  });

  it("uses the OWASP baseline cost, encoded in the hash itself", async () => {
    const h = await hashPassword("x".repeat(16));
    expect(h).toContain("m=19456,t=2,p=1");
  });

  it("produces a different hash for the same password — the salt is per-row", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same")).toBe(true);
    expect(await verifyPassword(b, "same")).toBe(true);
  });

  it("treats a malformed stored hash as a failed login, never a throw", async () => {
    // A 500 here would distinguish "this account exists but its hash is broken" from
    // "wrong password", which is an enumeration oracle.
    await expect(verifyPassword("not-a-hash", "x")).resolves.toBe(false);
    await expect(verifyPassword("", "x")).resolves.toBe(false);
  });

  it("flags a weaker hash for rehash and leaves a current one alone", async () => {
    expect(needsRehash("$argon2id$v=19$m=4096,t=1,p=1$abc$def")).toBe(true);
    expect(needsRehash("$argon2id$v=19$m=19456,t=2,p=1$abc$def")).toBe(false);
    expect(needsRehash("$2b$12$legacybcrypthash")).toBe(true);
  });
});

describe("tokens", () => {
  it("generates 32 bytes of entropy, base64url", () => {
    const t = generateToken();
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(t).not.toMatch(/[+/=]/); // base64url, safe in a URL and a cookie
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateToken()));
    expect(seen.size).toBe(2000);
  });

  it("hashes deterministically — the database looks these up BY hash", () => {
    const t = generateToken();
    expect(tokensEqual(hashToken(t), hashToken(t))).toBe(true);
    expect(hashToken(t)).toHaveLength(32);
    expect(tokensEqual(hashToken(t), hashToken(generateToken()))).toBe(false);
  });

  it("compares in constant time and rejects a length mismatch", () => {
    const a = hashToken("a");
    expect(tokensEqual(a, hashToken("a"))).toBe(true);
    expect(tokensEqual(a, hashToken("b"))).toBe(false);
    expect(tokensEqual(a, Buffer.alloc(16))).toBe(false);
  });
});

describe("emailed link tokens are selector + secret", () => {
  it("round-trips", () => {
    const id = "01a099c3-98c0-7768-8c7c-19cf18121e3c";
    const token = generateToken();
    const parsed = parseLinkToken(formatLinkToken(id, token));
    expect(parsed).toEqual({ id, token });
  });

  it("refuses a bare token with no selector", () => {
    // Argon2id salts per row, so `WHERE code_hash = argon2(token)` matches nothing ever.
    // A bare token forces either "verify against every live row" or a silent switch to an
    // unsalted hash — the second being the two-hashing-paths bug the rule prevents.
    expect(parseLinkToken(generateToken())).toBeNull();
  });

  it("refuses a malformed or injected selector", () => {
    expect(parseLinkToken(".abc")).toBeNull();
    expect(parseLinkToken("abc.")).toBeNull();
    expect(parseLinkToken("' OR 1=1 --.tok")).toBeNull();
    expect(parseLinkToken("../../etc/passwd.tok")).toBeNull();
  });
});

describe("numeric codes", () => {
  it("is always six digits, zero-padded", () => {
    for (let i = 0; i < 500; i++) expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  it("reaches both ends of the range over many draws", () => {
    // `randomInt` is rejection-sampled; `% 1000000` would be biased toward low values.
    const draws = Array.from({ length: 4000 }, () => Number(generateNumericCode()));
    expect(Math.min(...draws)).toBeLessThan(100_000);
    expect(Math.max(...draws)).toBeGreaterThan(900_000);
  });
});
