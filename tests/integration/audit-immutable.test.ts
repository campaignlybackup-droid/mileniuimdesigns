import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Commissioned by 09 P03 criterion (f) and 07 §7.4.
 *
 * An audit log the audited party can edit is decoration. The architecture specifies
 * INSERT/SELECT-only grants for the application role; a grant alone is untestable on a
 * superuser development database and silently does nothing if the role is ever changed,
 * so the invariant is ALSO a trigger. These assert the trigger actually fires.
 */
const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"]!;
const client = new Client({ connectionString: url });
let insertedId: string;

beforeAll(async () => {
  await client.connect();
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO audit_logs (id, actor_type, entity, action, summary, created_at)
     VALUES (gen_random_uuid(), 'system', 'test', 'test.write', 'immutability probe', now())
     RETURNING id`,
  );
  insertedId = rows[0]!.id;
});

afterAll(async () => {
  // Deliberately NOT cleaning up: the row cannot be deleted, which is the point. It is a
  // single 'test' entity row and the retention job will not touch it while
  // settings['audit.retention_days'] is NULL.
  await client.end();
});

describe("audit_logs is append-only", () => {
  it("accepts an INSERT", () => {
    expect(insertedId).toBeTruthy();
  });

  it("REFUSES an UPDATE", async () => {
    let message = "";
    try {
      await client.query(`UPDATE audit_logs SET summary = 'tampered' WHERE id = $1`, [insertedId]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("append-only");
  });

  it("REFUSES a DELETE", async () => {
    let message = "";
    try {
      await client.query(`DELETE FROM audit_logs WHERE id = $1`, [insertedId]);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("append-only");
  });

  it("leaves the row intact and unchanged after both attempts", async () => {
    const { rows } = await client.query<{ summary: string }>(
      `SELECT summary FROM audit_logs WHERE id = $1`,
      [insertedId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toBe("immutability probe");
  });

  it("refuses a bulk DELETE too — not just a single-row one", async () => {
    let message = "";
    try {
      await client.query(`DELETE FROM audit_logs WHERE actor_type = 'system'`);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("append-only");
  });
});
