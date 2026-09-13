/**
 * Mint the first staff account — 09 P03.
 *
 * The seed creates NO user on purpose. A seeded default login is the single most
 * reliable way for a development credential to reach production, so the first account is
 * minted deliberately, once, by a human running this.
 *
 * Usage:
 *   npm run create:admin -- --email you@example.com --role owner
 *   npm run create:admin -- --email you@example.com --password '…' --role admin
 *
 * With no --password, one is generated and printed ONCE. It is never stored in the clear
 * and never written to a log.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLE_KEYS } from "../src/lib/rbac/catalogue";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/**
 * argon2id with OWASP-recommended parameters (07 §1.4). Not a fast hash: this is the one
 * value a database breach makes directly reusable, and it protects an account that can
 * refund money and read every customer's address.
 */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 as const };

async function main(): Promise<void> {
  const email = arg("email");
  const roleKey = arg("role") ?? "owner";
  const supplied = arg("password");

  if (!email || !email.includes("@")) {
    console.error("✗ --email is required, e.g. npm run create:admin -- --email you@example.com");
    process.exit(1);
  }
  if (!(ROLE_KEYS as readonly string[]).includes(roleKey)) {
    console.error(`✗ --role must be one of: ${ROLE_KEYS.join(", ")}`);
    process.exit(1);
  }

  // 24 bytes base64url ≈ 192 bits. Long enough that it need never be memorised — it goes
  // straight into a password manager.
  const password = supplied ?? randomBytes(24).toString("base64url");
  if (password.length < 12) {
    console.error("✗ --password must be at least 12 characters.");
    process.exit(1);
  }

  const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    console.error("✗ DIRECT_URL or DATABASE_URL must be set.");
    process.exit(1);
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 5 }) });
  try {
    const role = await db.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.error(`✗ Role "${roleKey}" does not exist. Run \`npm run db:seed\` first.`);
      process.exit(1);
    }

    const existing = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    });
    if (existing) {
      console.error(`✗ A live user already exists with ${email}.`);
      process.exit(1);
    }

    const passwordHash = await hash(password, ARGON2);

    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: arg("first") ?? "",
          lastName: arg("last") ?? "",
          isActive: true,
          passwordChangedAt: new Date(),
          totpRecoveryCodes: [],
        },
      });
      await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });
      // The account's own creation is the first audit row. An admin account that appears
      // with no provenance is exactly what an audit log exists to make impossible.
      await tx.auditLog.create({
        data: {
          actorType: "system",
          entity: "users",
          entityId: u.id,
          action: "user.create",
          summary: `Bootstrap ${roleKey} account created by scripts/create-admin.ts`,
          after: { email, role: roleKey },
        },
      });
      return u;
    });

    console.log(`\n✓ Created ${roleKey}: ${email}  (id ${user.id})`);
    if (!supplied) {
      console.log(`\n  Password (shown once — store it in a password manager now):\n\n    ${password}\n`);
    }
    console.log(
      "  Staff above the privilege line must enrol TOTP before this account can mint a\n" +
        "  session (07 §1.9). That happens on first sign-in.\n",
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
