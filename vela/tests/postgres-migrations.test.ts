import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Replays the checked-in PostgreSQL migrations on an in-process PostgreSQL (PGlite) and checks the
 * username migration against (a) a fresh database and (b) a database that already holds users, the
 * way production does. No real production database is touched or reachable from this test.
 */
const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const USERNAME_MIGRATION = "20261016000000_username_login";
const PRODUCT_MIGRATION = "20261018000000_product_applications";

let pg: PGlite;

const insertUser = (id: string, email: string, username: string | null, normalized: string | null) =>
  pg.query(
    `INSERT INTO "User" ("id","email","username","usernameNormalized","passwordHash","firstName","lastName","updatedAt")
     VALUES ($1,$2,$3,$4,'hash','T','U',now())`,
    [id, email, username, normalized],
  );

const GUARD_MIGRATION = "20261015015000_ensure_external_account_table";
const sql = (name: string) => readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");

/** Pre-existing databases already have this table (created from the Prisma schema), without the guard migration. */
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

/** Rows as they could exist in production before this change: mixed-case emails, MFA state, no phone, etc. */
async function seedExistingData(db: PGlite) {
  await db.exec(`
    INSERT INTO "User" ("id","email","passwordHash","firstName","lastName","phone","role","enrollmentStatus","mfaEnabled","totpSecretEncrypted","updatedAt")
    VALUES
      ('legacy-1','legacy@example.com','h1','Old','Timer','+1 (312) 555-0192','CUSTOMER','APPROVED',true,'enc:secret:1',now()),
      ('legacy-2','Mixed.Case@Example.com','h2','Mia','Case',NULL,'CUSTOMER','PENDING_APPROVAL',false,NULL,now()),
      ('legacy-admin','admin-person@example.com','h3','Ada','Min','773-555-4455','ADMIN','APPROVED',true,'enc:secret:3',now());
    INSERT INTO "Account" ("id","userId","type","name","accountNumber","routingNumber","balance")
    VALUES ('acct-1','legacy-1','CHECKING','Everyday Checking','184700000014','021000021',123456);
    INSERT INTO "ExternalAccount" ("id","userId","institutionName","nickname","accountType","accountMask","status")
    VALUES ('ext-1','legacy-1','Example Bank','Main','CHECKING','1296','VERIFIED');
  `);
}

const snapshot = async (db: PGlite) => ({
  users: (await db.query(`SELECT "id","email","passwordHash","firstName","lastName","phone","role","enrollmentStatus","mfaEnabled","totpSecretEncrypted" FROM "User" ORDER BY "id"`)).rows,
  accounts: (await db.query(`SELECT * FROM "Account" ORDER BY "id"`)).rows,
  external: (await db.query(`SELECT * FROM "ExternalAccount" ORDER BY "id"`)).rows,
});

async function applyThrough(db: PGlite, lastExclusive: string, opts: { skipGuard?: boolean } = {}) {
  for (const name of migrations) {
    if (name === lastExclusive) break;
    if (opts.skipGuard && name === GUARD_MIGRATION) continue;
    if (opts.skipGuard && name === "20261015020000_external_account_verification") await db.exec(EXTERNAL_ACCOUNT_BASELINE);
    await db.exec(sql(name));
  }
}

beforeAll(async () => {
  // Fresh database: the whole checked-in history, with no hand-built baseline.
  pg = new PGlite();
  await applyThrough(pg, USERNAME_MIGRATION);
  await seedExistingData(pg);
  await pg.exec(sql(USERNAME_MIGRATION));
  await pg.exec(sql(PRODUCT_MIGRATION));
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("username migration (fresh database, full history)", () => {
  it("is the latest migration and the guard migration sorts between the two it sits between", () => {
    expect(migrations).toContain(USERNAME_MIGRATION);
    expect(migrations.at(-1)).toBe(PRODUCT_MIGRATION);
    const guard = migrations.indexOf(GUARD_MIGRATION);
    expect(migrations[guard - 1]).toBe("20261015010000_transaction_approvals");
    expect(migrations[guard + 1]).toBe("20261015020000_external_account_verification");
  });

  it("leaves existing users untouched and without a generated username", async () => {
    const { rows } = await pg.query<{ id: string; username: string | null; usernameNormalized: string | null }>(
      `SELECT "id","username","usernameNormalized" FROM "User" ORDER BY "id"`,
    );
    expect(rows).toEqual([
      { id: "legacy-1", username: null, usernameNormalized: null },
      { id: "legacy-2", username: null, usernameNormalized: null },
      { id: "legacy-admin", username: null, usernameNormalized: null },
    ]);
  });

  it("allows any number of users without a username", async () => {
    await insertUser("n1", "n1@example.com", null, null);
    await insertUser("n2", "n2@example.com", null, null);
    const { rows } = await pg.query<{ c: number }>(`SELECT count(*)::int AS c FROM "User" WHERE "usernameNormalized" IS NULL`);
    expect(rows[0].c).toBeGreaterThanOrEqual(5);
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

describe("schema drift", () => {
  const SCALARS = new Set(["String", "Int", "Boolean", "DateTime", "Float", "BigInt", "Decimal", "Json"]);

  it("the migrated database matches prisma/schema.postgresql.prisma (tables, columns, nullability)", async () => {
    const schema = readFileSync(path.resolve(__dirname, "../prisma/schema.postgresql.prisma"), "utf8");
    const models: Record<string, Record<string, boolean>> = {};
    let current: string | null = null;
    for (const line of schema.split("\n")) {
      const model = /^model (\w+) \{/.exec(line);
      if (model) { current = model[1]; models[current] = {}; continue; }
      if (line.startsWith("}")) { current = null; continue; }
      const field = /^\s+(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
      const trimmed = line.trim();
      if (current && field && !trimmed.startsWith("@@") && !trimmed.startsWith("//") && SCALARS.has(field[2]) && field[3] !== "[]") {
        models[current][field[1]] = field[3] === "?";
      }
    }
    expect(Object.keys(models)).toContain("User");

    const problems: string[] = [];
    for (const [model, fields] of Object.entries(models)) {
      const { rows } = await pg.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = $1`, [model],
      );
      if (rows.length === 0) { problems.push(`missing table ${model}`); continue; }
      const actual = new Map(rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
      for (const [column, nullable] of Object.entries(fields)) {
        if (!actual.has(column)) problems.push(`${model}.${column} missing in database`);
        else if (actual.get(column) !== nullable) problems.push(`${model}.${column} nullability differs`);
      }
      for (const column of actual.keys()) if (!(column in fields)) problems.push(`${model}.${column} not in Prisma schema`);
    }
    expect(problems).toEqual([]);
  });

  it("the SQLite and PostgreSQL Prisma schemas declare the same username fields", () => {
    const pick = (file: string) =>
      readFileSync(path.resolve(__dirname, file), "utf8").split("\n").filter((l) => /^\s+username(Normalized)?\s/.test(l)).map((l) => l.trim().replace(/\s+/g, " "));
    expect(pick("../prisma/schema.postgresql.prisma")).toEqual(pick("../prisma/schema.prisma"));
    expect(pick("../prisma/schema.prisma")).toHaveLength(2);
  });
});

describe("existing production-style database", () => {
  /** Built WITHOUT the guard migration: the table already exists, as on databases created from the Prisma schema. */
  async function existingDatabase() {
    const db = new PGlite();
    await applyThrough(db, USERNAME_MIGRATION, { skipGuard: true });
    await seedExistingData(db);
    return db;
  }

  it("applies the guard and username migrations in order without changing any existing row", async () => {
    const db = await existingDatabase();
    const before = await snapshot(db);
    expect(before.users).toHaveLength(3);
    await db.exec(sql(GUARD_MIGRATION)); // applied late, out of order, as `migrate deploy` would
    await db.exec(sql(USERNAME_MIGRATION));
    expect(await snapshot(db)).toEqual(before);
    await db.close();
  });

  it("the guard migration is a no-op on an existing table and safe to run twice", async () => {
    const db = await existingDatabase();
    const columnsBefore = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ExternalAccount' ORDER BY column_name`)).rows;
    await db.exec(sql(GUARD_MIGRATION));
    await db.exec(sql(GUARD_MIGRATION));
    const columnsAfter = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ExternalAccount' ORDER BY column_name`)).rows;
    expect(columnsAfter).toEqual(columnsBefore);
    const fks = await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = '"ExternalAccount"'::regclass AND contype = 'f'`);
    expect(fks.rows).toHaveLength(1);
    await db.close();
  });

  it("is backwards compatible: the previous release's queries still work once the migration is applied", async () => {
    const db = await existingDatabase();
    await db.exec(sql(GUARD_MIGRATION));
    await db.exec(sql(USERNAME_MIGRATION));
    // Old code never mentions the new columns: sign-in lookup by email, enrollment insert, profile update.
    const login = await db.query(`SELECT "id","passwordHash" FROM "User" WHERE "email" = 'legacy@example.com'`);
    expect(login.rows).toHaveLength(1);
    await db.query(
      `INSERT INTO "User" ("id","email","passwordHash","firstName","lastName","enrollmentStatus","updatedAt") VALUES ('old-code-signup','old@example.com','h','O','C','PENDING_APPROVAL',now())`,
    );
    await db.query(`UPDATE "User" SET "phone" = '+1 555 010 0000' WHERE "id" = 'legacy-1'`);
    const inserted = await db.query<{ username: string | null }>(`SELECT "username" FROM "User" WHERE "id" = 'old-code-signup'`);
    expect(inserted.rows[0].username).toBeNull();
    await db.close();
  });

  it("is NOT compatible the other way round: the new release needs the columns first (deployment order)", async () => {
    const db = await existingDatabase();
    // What the new release runs on every sign-in, against a database that has not been migrated yet.
    await expect(db.query(`SELECT "id" FROM "User" WHERE "usernameNormalized" = 'sam'`)).rejects.toThrow(/usernameNormalized/);
    await db.close();
  });

  it("a normalized username that already collides is rejected rather than silently merged", async () => {
    const db = await existingDatabase();
    await db.exec(sql(GUARD_MIGRATION));
    await db.exec(sql(USERNAME_MIGRATION));
    await db.query(`UPDATE "User" SET "username"='Pat', "usernameNormalized"='pat' WHERE "id"='legacy-1'`);
    await expect(db.query(`UPDATE "User" SET "username"='PAT', "usernameNormalized"='pat' WHERE "id"='legacy-2'`)).rejects.toThrow(/duplicate key/i);
    await db.close();
  });

  it("the documented rollback removes only the username objects and keeps every other column and row", async () => {
    const db = await existingDatabase();
    await db.exec(sql(GUARD_MIGRATION));
    await db.exec(sql(USERNAME_MIGRATION));
    const before = await snapshot(db);
    await db.exec(readFileSync(path.resolve(__dirname, "../prisma/rollback/20261016000000_username_login.down.sql"), "utf8"));
    const cols = (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name='User'`)).rows.map((r) => r.column_name);
    expect(cols).not.toContain("username");
    expect(cols).not.toContain("usernameNormalized");
    expect(await snapshot(db)).toEqual(before);
    // Re-applying after a rollback works.
    await db.exec(sql(USERNAME_MIGRATION));
    await db.close();
  });
});
