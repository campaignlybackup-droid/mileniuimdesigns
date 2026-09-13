import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedMarkets } from "./01-markets";
import { seedRoles } from "./02-roles";
import { seedCustomerGroups } from "./03-customer-groups";
import { seedCategories } from "./03-categories";
import { seedStones } from "./04-stones";
import { seedMaterials } from "./05-materials";
import { seedSettings } from "./06-settings";
import { seedEmailTemplates } from "./07-email-templates";

/**
 * Development and bootstrap seed — 02 §6.
 *
 * Everything here is STRUCTURE: markets, currencies, roles, the 73 permissions, the
 * grant matrix, settings and email-template shells. No product, no price, no customer,
 * no historical claim, no marketing copy.
 *
 * It is idempotent by construction (09 P03 exit criterion (a)) and it creates NO USER
 * (criterion (c)) — the first staff account is minted deliberately by
 * `npm run create:admin`, so that a seeded default login cannot reach production.
 */
async function main(): Promise<void> {
  const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set to seed.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 5 }) });

  try {
    // Counted BEFORE, so the assertion below measures what the SEED did rather than what
    // is in the database. `npm run create:admin` legitimately creates the first account;
    // the criterion is that the seed never does (09 P03 (c)).
    const before = {
      users: await db.user.count(),
      customers: await db.customer.count(),
      products: await db.product.count(),
    };
    console.log("seeding markets, currencies, locations…");
    await seedMarkets(db);
    console.log("seeding roles, 73 permissions and the grant matrix…");
    await seedRoles(db);
    console.log("seeding the default customer group…");
    await seedCustomerGroups(db);
    console.log("seeding the nine categories (STONES is a route, not a row)…");
    await seedCategories(db);
    console.log("seeding seven stones and four materials, all copy blank…");
    await seedStones(db);
    await seedMaterials(db);
    console.log("seeding settings and branded state copy…");
    await seedSettings(db);
    console.log("seeding email template shells…");
    await seedEmailTemplates(db);

    const [permissions, roles, grants, users, groups, categories, stones, materials, products] = await Promise.all([
      db.permission.count(),
      db.role.count(),
      db.rolePermission.count(),
      db.user.count(),
      db.customerGroup.count(),
      db.category.count({ where: { deletedAt: null } }),
      db.stone.count({ where: { deletedAt: null } }),
      db.material.count({ where: { deletedAt: null } }),
      db.product.count(),
    ]);
    console.log(
      `\n  permissions ${permissions}   roles ${roles}   grants ${grants}   groups ${groups}` +
        `\n  categories ${categories}   stones ${stones}   materials ${materials}` +
        `\n  products ${products}   users ${users}   (live users: ${await db.user.count({ where: { deletedAt: null } })})`,
    );

    // The catalogue is the CLIENT'S. Seeding a product would be inventing a jewellery
    // house's inventory, which hard rule 8 forbids outright.
    if (products !== before.products) {
      throw new Error(
        `Seed created ${products - before.products} product(s). It must create none.`,
      );
    }
    if (categories !== 9) {
      throw new Error(
        `Expected exactly 9 live categories, found ${categories}. STONES is a reserved ` +
          `route segment and is a navigation_items row, not a category (08 §4.1).`,
      );
    }
    if (stones !== 7 || materials !== 4) {
      throw new Error(`Expected 7 stones and 4 materials, found ${stones} and ${materials}.`);
    }
    if (groups === 0) {
      throw new Error(
        "No customer group was seeded. customers.customer_group_id is NOT NULL, so " +
          "without one no customer — and therefore no order — can ever be created.",
      );
    }
    const customers = await db.customer.count();
    if (customers !== before.customers) {
      throw new Error(
        `Seed created ${customers - before.customers} customer(s). It must create none: ` +
          `inventing a customer for a real jewellery house is exactly what hard rule 8 ` +
          `forbids, and a seeded customer would carry a fabricated consent record.`,
      );
    }
    if (users !== before.users) {
      throw new Error(
        `Seed created ${users - before.users} user(s). It must create none — the first ` +
          `staff account is minted by \`npm run create:admin\`, so that a seeded default ` +
          `login cannot reach production (09 P03 exit criterion (c)).`,
      );
    }
    console.log("\n✓ seed complete\n");
  } finally {
    await db.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
