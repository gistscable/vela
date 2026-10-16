import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies the checked-in PostgreSQL migrations, in order, to an in-process PostgreSQL (PGlite) and
 * checks the username migration's behaviour for existing and new users.
 */
const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const USERNAME_MIGRATION = "20261016000000_username_login";

let pg: PGlite;

const insertUser = (id: string, email: string, username: string | null, normalized: string | null) =>
  pg.query(
    `INSERT INTO "User" ("id","email","username","usernameNormalized","passwordHash","firstName","lastName","updatedAt")
     VALUES ($1,$2,$3,$4,'hash','T','U',now())`,
    [id, email, username, normalized],
  );

// KNOWN GAP in the pre-existing history (not caused by the username migration): the init migration
// never creates "ExternalAccount", yet 20261015020000_external_account_verification alters it, so
// `migrate deploy` on a brand-new database fails there. Databases that were created from the
// Prisma schema already have the table, so we mirror that baseline here before replaying.
const EXTERNAL_ACCOUNT_BASELINE = `
  CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "institutionName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountMask" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

beforeAll(async () => {
  pg = new PGlite();
  for (const name of migrations) {
    if (name === USERNAME_MIGRATION) break;
    if (name === "20261015020000_external_account_verification") await pg.exec(EXTERNAL_ACCOUNT_BASELINE);
    await pg.exec(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  }
  // An existing user created before usernames existed.
  await pg.query(
    `INSERT INTO "User" ("id","email","passwordHash","firstName","lastName","updatedAt") VALUES ('legacy-1','legacy@example.com','hash','Old','Timer',now())`,
  );
  await pg.exec(readFileSync(path.join(migrationsDir, USERNAME_MIGRATION, "migration.sql"), "utf8"));
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("username migration (PostgreSQL)", () => {
  it("is the latest migration and sorts after the existing ones", () => {
    expect(migrations.at(-1)).toBe(USERNAME_MIGRATION);
  });

  it("leaves existing users untouched and without a generated username", async () => {
    const { rows } = await pg.query<{ id: string; email: string; username: string | null; usernameNormalized: string | null }>(
      `SELECT "id","email","username","usernameNormalized" FROM "User" WHERE "id" = 'legacy-1'`,
    );
    expect(rows).toEqual([{ id: "legacy-1", email: "legacy@example.com", username: null, usernameNormalized: null }]);
  });

  it("allows any number of users without a username", async () => {
    await insertUser("n1", "n1@example.com", null, null);
    await insertUser("n2", "n2@example.com", null, null);
    const { rows } = await pg.query<{ c: number }>(`SELECT count(*)::int AS c FROM "User" WHERE "usernameNormalized" IS NULL`);
    expect(rows[0].c).toBeGreaterThanOrEqual(3);
  });

  it("enforces case-insensitive uniqueness", async () => {
    await insertUser("u1", "u1@example.com", "Sam.Lee", "sam.lee");
    await expect(insertUser("u2", "u2@example.com", "SAM.LEE", "sam.lee")).rejects.toThrow(/duplicate key|unique/i);
    await expect(insertUser("u3", "u3@example.com", "sam.lee", "sam.lee")).rejects.toThrow(/duplicate key|unique/i);
  });

  it("still enforces unique emails", async () => {
    await expect(insertUser("u4", "u1@example.com", "other.name", "other.name")).rejects.toThrow(/duplicate key|unique/i);
  });

  it("rejects a normalized value that is not the lower-cased username, or half-set pairs", async () => {
    await expect(insertUser("c1", "c1@example.com", "Mixed.Case", "Mixed.Case")).rejects.toThrow(/check constraint/i);
    await expect(insertUser("c2", "c2@example.com", "someone", null)).rejects.toThrow(/check constraint/i);
    await expect(insertUser("c3", "c3@example.com", null, "someone")).rejects.toThrow(/check constraint/i);
  });

  it("rejects an @ in a username so it cannot be mistaken for an email", async () => {
    await expect(insertUser("c4", "c4@example.com", "a@b.co", "a@b.co")).rejects.toThrow(/check constraint/i);
  });

  it("lets a legacy user later claim a username without changing their id or email", async () => {
    await pg.query(`UPDATE "User" SET "username"='Old.Timer', "usernameNormalized"='old.timer' WHERE "id"='legacy-1' AND "usernameNormalized" IS NULL`);
    const { rows } = await pg.query<{ id: string; email: string; username: string }>(`SELECT "id","email","username" FROM "User" WHERE "usernameNormalized"='old.timer'`);
    expect(rows).toEqual([{ id: "legacy-1", email: "legacy@example.com", username: "Old.Timer" }]);
  });
});
