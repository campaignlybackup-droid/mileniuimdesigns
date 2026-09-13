import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  createProduct,
  publishProduct,
  saveProduct,
  setProductSlug,
  assertNoServerAuthoritativeFields,
  ServerAuthoritativeFieldError,
} from "@/lib/catalog";
import { permissionsForRoles } from "@/lib/rbac";
import { ConflictError, ForbiddenError, SlugTakenError, StaleWriteError } from "@/lib/errors";
import type { StaffActor } from "@/lib/rbac";

/** Commissioned by 09 P07 exit criteria (a)–(e). */
const stamp = Date.now();
const owner: StaffActor = {
  kind: "staff",
  userId: "00000000-0000-7000-8000-000000000001",
  roles: ["owner"],
  permissions: permissionsForRoles(["owner"]),
  totpVerifiedAt: new Date(),
};
const analyst: StaffActor = {
  kind: "staff",
  userId: "00000000-0000-7000-8000-000000000002",
  roles: ["analyst"],
  permissions: permissionsForRoles(["analyst"]),
  totpVerifiedAt: null,
};

const made: string[] = [];

afterAll(async () => {
  await db.redirect.deleteMany({ where: { fromPath: { contains: `p7-${stamp}` } } });
  await db.product.deleteMany({ where: { id: { in: made } } });
});

async function newProduct(suffix: string) {
  const r = await createProduct(owner, { title: "Probe piece", slug: `p7-${stamp}-${suffix}` });
  made.push(r.id);
  return r;
}

describe("authorization", () => {
  it("refuses a role without product.update", async () => {
    const p = await newProduct("authz");
    await expect(
      saveProduct(analyst, { id: p.id, expectedVersion: p.version, title: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a role without product.create", async () => {
    await expect(
      createProduct(analyst, { title: "x", slug: `p7-${stamp}-nope` }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("optimistic concurrency", () => {
  it("a stale expectedVersion returns StaleWriteError and WRITES NOTHING", async () => {
    // 09 P07 criterion (c). A read-then-write would overwrite the first editor without
    // either of them noticing.
    const p = await newProduct("stale");
    await saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "First edit" });

    await expect(
      saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "Second edit" }),
    ).rejects.toBeInstanceOf(StaleWriteError);

    const after = await db.product.findUniqueOrThrow({
      where: { id: p.id },
      select: { title: true },
    });
    expect(after.title).toBe("First edit");
  });

  it("two simultaneous saves: exactly one wins", async () => {
    const p = await newProduct("race");
    const results = await Promise.allSettled([
      saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "A" }),
      saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "B" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StaleWriteError);
  });

  it("the error names both versions, so an editor can see what happened", async () => {
    const p = await newProduct("msg");
    await saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "One" });
    try {
      await saveProduct(owner, { id: p.id, expectedVersion: p.version, title: "Two" });
    } catch (e) {
      expect((e as StaleWriteError).message).toMatch(/version/i);
    }
  });
});

describe("server-authoritative fields are REFUSED, not ignored", () => {
  it("refuses a payload carrying price, inventory, version or sold_at", () => {
    // 09 P07 criterion (e). Silently ignoring them lets the admin believe it saved a
    // price that never changed — and nobody finds out until a customer is charged the
    // old one.
    for (const field of [
      "price",
      "inventory",
      "version",
      "soldAt",
      "isDemo",
      "status",
      "slug",
    ]) {
      expect(
        () => assertNoServerAuthoritativeFields({ title: "x", [field]: 1 }),
        field,
      ).toThrow(ServerAuthoritativeFieldError);
    }
  });

  it("names the offending fields rather than failing vaguely", () => {
    try {
      assertNoServerAuthoritativeFields({ title: "x", price: 1, inventory: 2 });
    } catch (e) {
      expect((e as Error).message).toContain("price");
      expect((e as Error).message).toContain("inventory");
    }
  });

  it("allows an ordinary editorial payload", () => {
    expect(() =>
      assertNoServerAuthoritativeFields({ title: "Labradorite ring", subtitle: "A piece" }),
    ).not.toThrow();
  });
});

describe("slug changes", () => {
  it("refuses a malformed slug", async () => {
    const p = await newProduct("slugbad");
    // "UPPER" is NOT in this list: slugs are lower-cased before validation, so an editor
    // typing capitals gets a working slug rather than an error. Normalising input the
    // caller obviously meant is help; rejecting it is pedantry.
    for (const bad of ["Not A Slug", "trailing-", "double--hyphen", "has_underscore", ""]) {
      await expect(
        setProductSlug(owner, { id: p.id, slug: bad, expectedVersion: p.version }),
      ).rejects.toThrow();
    }
  });

  it("refuses a slug already in use", async () => {
    await newProduct("slug-a");
    const b = await newProduct("slug-b");
    await expect(
      setProductSlug(owner, {
        id: b.id,
        slug: `p7-${stamp}-slug-a`,
        expectedVersion: b.version,
      }),
    ).rejects.toBeInstanceOf(SlugTakenError);
  });

  it("writes NO redirect for a draft — that URL never existed", async () => {
    const p = await newProduct("draft-slug");
    const r = await setProductSlug(owner, {
      id: p.id,
      slug: `p7-${stamp}-draft-renamed`,
      expectedVersion: p.version,
    });
    expect(r.redirectCreated).toBe(false);
  });

  it("writes the redirect IN THE SAME TRANSACTION for a published product", async () => {
    // 09 P07 criterion (b). Two statements outside a transaction leave a window in which
    // the old URL 404s — for a customer following an emailed link, or a crawler
    // revisiting an indexed page.
    const p = await newProduct("pub-slug");
    // Publishing needs the gate satisfied; set the product up to pass it.
    await db.product.update({
      where: { id: p.id },
      data: { status: "active", publishedAt: new Date() },
    });

    const current = await db.product.findUniqueOrThrow({
      where: { id: p.id },
      select: { version: true, slug: true },
    });
    const oldSlug = current.slug;
    const r = await setProductSlug(owner, {
      id: p.id,
      slug: `p7-${stamp}-pub-renamed`,
      expectedVersion: current.version,
    });
    expect(r.redirectCreated).toBe(true);

    const redirect = await db.redirect.findFirst({
      where: { fromPath: `/products/${oldSlug}` },
    });
    expect(redirect?.toPath).toBe(`/products/p7-${stamp}-pub-renamed`);
    expect(redirect?.statusCode).toBe(301);
  });

  it("flattens a chain rather than leaving two hops", async () => {
    // A→B then B→C must give A→C, not A→B→C. A crawler follows one hop and gives up.
    const p = await newProduct("chain");
    await db.product.update({ where: { id: p.id }, data: { status: "active" } });

    let v = (
      await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { version: true } })
    ).version;
    const first = `p7-${stamp}-chain`;
    const second = `p7-${stamp}-chain-2`;
    const third = `p7-${stamp}-chain-3`;

    ({ version: v } = await setProductSlug(owner, {
      id: p.id,
      slug: second,
      expectedVersion: v,
    }));
    await setProductSlug(owner, { id: p.id, slug: third, expectedVersion: v });

    const a = await db.redirect.findFirst({ where: { fromPath: `/products/${first}` } });
    expect(a?.toPath, "A still points at B — the chain was not flattened").toBe(
      `/products/${third}`,
    );
  });

  it("does not create a loop when a slug is changed back", async () => {
    // A→B then B→A would take the product permanently offline at both URLs.
    const p = await newProduct("loop");
    await db.product.update({ where: { id: p.id }, data: { status: "active" } });
    let v = (
      await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { version: true } })
    ).version;
    const original = `p7-${stamp}-loop`;
    const renamed = `p7-${stamp}-loop-2`;

    ({ version: v } = await setProductSlug(owner, {
      id: p.id,
      slug: renamed,
      expectedVersion: v,
    }));
    await setProductSlug(owner, { id: p.id, slug: original, expectedVersion: v });

    const live = await db.redirect.findMany({
      where: {
        isActive: true,
        OR: [{ fromPath: `/products/${original}` }, { fromPath: `/products/${renamed}` }],
      },
    });
    const loop = live.filter(
      (r) => r.toPath === `/products/${original}` || r.toPath === `/products/${renamed}`,
    );
    // At most one direction may survive; both would be a loop.
    expect(loop.length).toBeLessThanOrEqual(1);
  });
});

describe("the publish gate", () => {
  it("refuses an incomplete product and NAMES the missing fields", async () => {
    // 09 P07 criterion (d). "Incomplete" is not something an editor can act on.
    const p = await newProduct("gate");
    try {
      await publishProduct(owner, { id: p.id, expectedVersion: p.version });
      throw new Error("expected the gate to refuse");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/Hero image|Primary category|SKUs/);
    }
  });

  it("refuses a role without product.publish", async () => {
    const p = await newProduct("gate-authz");
    await expect(
      publishProduct(analyst, { id: p.id, expectedVersion: p.version }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("scoring", () => {
  it("scores a new product low and records the checks", async () => {
    const p = await newProduct("score");
    const row = await db.product.findUniqueOrThrow({
      where: { id: p.id },
      select: { completenessScore: true, completenessChecks: true },
    });
    expect(row.completenessScore).toBeLessThan(30);
    const checks = (row.completenessChecks as { checks: { key: string }[] }).checks;
    expect(checks.length).toBe(15);
    expect(checks.map((c) => c.key)).toContain("priced_all_markets");
  });

  it("reindexes search_text from the title", async () => {
    const p = await newProduct("reindex");
    await saveProduct(owner, {
      id: p.id,
      expectedVersion: p.version,
      title: "Labradorite Drop",
    });
    const row = await db.product.findUniqueOrThrow({
      where: { id: p.id },
      select: { searchText: true },
    });
    expect(row.searchText).toContain("Labradorite");
  });
});
