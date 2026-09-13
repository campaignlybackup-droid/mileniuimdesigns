import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Commissioned by docs/architecture/01-stack-and-structure.md §6.1.
 *
 * prisma's `latest` dist-tag is a v8 RELEASE CANDIDATE while `@prisma/client`'s is v7.
 * So `npm i -D prisma` — and any future `npm update` — installs a v8 RC CLI against a v7
 * client. That mismatch does not fail at install time. It fails later, during a
 * migration, looking like a schema problem.
 */
describe("Prisma version parity", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  const cli = pkg.devDependencies["prisma"];
  const client = pkg.dependencies["@prisma/client"];
  const adapter = pkg.dependencies["@prisma/adapter-pg"];

  it("pins the CLI, the client and the adapter to the same exact version", () => {
    expect(cli).toBeDefined();
    expect(client).toBeDefined();
    expect(adapter).toBeDefined();
    expect(cli).toBe(client);
    expect(client).toBe(adapter);
  });

  it("pins exact versions — no range that could drift into the v8 RC", () => {
    for (const v of [cli, client, adapter]) {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("is not a prerelease", () => {
    for (const v of [cli, client, adapter]) {
      expect(v).not.toMatch(/-(rc|alpha|beta|dev|integration)/);
    }
  });
});

describe("TypeScript target", () => {
  it("is at least ES2020, or bigint money does not compile", () => {
    const raw = readFileSync(resolve(process.cwd(), "tsconfig.json"), "utf8");
    const tsconfig = JSON.parse(raw) as { compilerOptions: { target: string } };
    const target = tsconfig.compilerOptions.target.toUpperCase();
    const year = Number(target.replace("ES", ""));
    // Every money value in this system is a bigint (02 §1.10). Below ES2020 the literals
    // are a compile error, which makes the integer-money decision unimplementable.
    expect(Number.isFinite(year) && year >= 2020).toBe(true);
  });
});
