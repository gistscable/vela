import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { build, checksums, EXISTING, GUARD, USERNAME } from "../scripts/build-supabase-sql.mjs";

/**
 * The scripts in docs/supabase/ are what gets pasted into the Supabase SQL editor. They are generated from
 * prisma/migrations and replayed here on PostgreSQL (PGlite) so the exact text that will run in production is tested.
 */
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "prisma/migrations");
const migrationSql = (name: string) => readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
const script = (name: string) => readFileSync(path.join(root, "docs/supabase", name), "utf8");

const EXTERNAL_ACCOUNT_BASELINE = `CREATE TABLE "ExternalAccount" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "institutionName" TEXT NOT NULL, "nickname" TEXT NOT NULL, "accountType" TEXT NOT NULL, "accountMask" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);`;

/** Production-like and UNTRACKED: five released migrations' schema, ExternalAccount created outside the migrations, one user. */
async function untrackedProductionDb() {
  const db = new PGlite();
  await db.exec(migrationSql(EXISTING[0]));
  await db.exec(migrationSql(EXISTING[1]));
  await db.exec(EXTERNAL_ACCOUNT_BASELINE);
  for (const name of EXISTING.slice(2)) await db.exec(migrationSql(name));
  await db.exec(`INSERT INTO "User" ("id","email","passwordHash","firstName","lastName","updatedAt") VALUES ('u1','legacy@example.com','h','Old','Timer',now())`);
  return db;
}
const verdict = async (db: PGlite, file: string) => {
  const rows = (await db.query<{ item: string; status: string; detail: string }>(script(file))).rows;
  return { rows, last: rows[rows.length - 1] };
};

describe("docs/supabase scripts", () => {
  it("are up to date with prisma/migrations", () => {
    for (const [name, body] of Object.entries(build() as Record<string, string>)) expect(script(name), name).toBe(body);
  });

  it("embed both new migrations byte-for-byte, with Prisma's SHA-256 checksums", () => {
    const apply = script("03_apply_username_migrations.sql");
    for (const name of [GUARD, USERNAME]) {
      expect(apply).toContain(migrationSql(name).trimEnd());
      const sha = createHash("sha256").update(readFileSync(path.join(migrationsDir, name, "migration.sql"))).digest("hex");
      expect(checksums[name]).toBe(sha);
      expect(apply).toContain(`'${sha}'`);
    }
    expect(script("02_baseline_untracked_only.sql")).toContain(checksums[EXISTING[4]]);
  });

  it("01a/01b are read-only", () => {
    for (const f of ["01a_readonly_state_check.sql", "01b_readonly_migration_history.sql", "04_verify_read_only.sql"]) {
      expect(script(f).replace(/--.*$/gm, "").replace(/'[^']*'/g, "''")).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i);
    }
  });

  describe("untracked database", () => {
    let db: PGlite;
    beforeEach(async () => { db = await untrackedProductionDb(); });

    it("01a says READY + UNTRACKED before any change", async () => {
      const { rows, last } = await verdict(db, "01a_readonly_state_check.sql");
      expect(last).toMatchObject({ item: "VERDICT", status: "READY" });
      expect(rows.find((r) => r.item.startsWith("tracking"))?.status).toBe("UNTRACKED");
    });

    it("03 refuses to run before 02 and changes nothing", async () => {
      await expect(db.exec(script("03_apply_username_migrations.sql"))).rejects.toThrow(/untracked/);
      await db.exec("ROLLBACK").catch(() => {});
      const cols = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name LIKE 'username%'`);
      expect(cols.rows).toHaveLength(0);
    });

    it("02 -> 03 -> 04 passes, records match, data untouched, and re-running refuses", async () => {
      const before = (await db.query(`SELECT * FROM "User" ORDER BY id`)).rows;
      await db.exec(script("02_baseline_untracked_only.sql"));
      await expect(db.exec(script("02_baseline_untracked_only.sql"))).rejects.toThrow(/already exists/);
      await db.exec("ROLLBACK").catch(() => {});
      await db.exec(script("03_apply_username_migrations.sql"));

      const { rows, last } = await verdict(db, "04_verify_read_only.sql");
      expect(rows.filter((r) => r.status !== "PASS" && r.item !== "VERDICT")).toEqual([]);
      expect(last).toMatchObject({ item: "VERDICT", status: "ALL PASS" });

      const after = (await db.query(`SELECT * FROM "User" ORDER BY id`)).rows as Record<string, unknown>[];
      expect(after.map(({ username, usernameNormalized, ...rest }) => { expect(username).toBeNull(); expect(usernameNormalized).toBeNull(); return rest; })).toEqual(before);

      await expect(db.exec(script("03_apply_username_migrations.sql"))).rejects.toThrow(/already recorded/);
      await db.exec("ROLLBACK").catch(() => {});
      const history = (await db.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations"`)).rows.map((r) => r.migration_name);
      expect(history.sort()).toEqual([...EXISTING, GUARD, USERNAME].sort());
    });

    it("a failure part-way rolls the whole script back (columns, guard objects and records)", async () => {
      await db.exec(script("02_baseline_untracked_only.sql"));
      await db.exec(`CREATE TABLE "User_usernameNormalized_key" (x int)`); // collides with the unique index name
      await expect(db.exec(script("03_apply_username_migrations.sql"))).rejects.toThrow(/already exists/);
      await db.exec("ROLLBACK").catch(() => {});
      expect((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name LIKE 'username%'`)).rows).toHaveLength(0);
      expect((await db.query(`SELECT 1 FROM "_prisma_migrations" WHERE migration_name IN ('${GUARD}','${USERNAME}')`)).rows).toHaveLength(0);
      expect((await db.query(`SELECT 1 FROM pg_indexes WHERE indexname='ExternalAccount_userId_createdAt_idx'`)).rows).toHaveLength(0);
    });
  });

  it("01a says STOP when a released migration's changes are missing", async () => {
    const db = await untrackedProductionDb();
    await db.exec(`ALTER TABLE "User" DROP COLUMN "mfaLockedUntil"`);
    const { rows, last } = await verdict(db, "01a_readonly_state_check.sql");
    expect(last.status).toBe("STOP");
    expect(rows.find((r) => r.item.includes("totp_mfa"))).toMatchObject({ status: "STOP", detail: "missing: User.mfaLockedUntil" });
  });

  it("04 errors (column \"username\" does not exist) on a database that has not been migrated", async () => {
    const db = await untrackedProductionDb();
    await db.exec(script("02_baseline_untracked_only.sql"));
    await expect(db.query(script("04_verify_read_only.sql"))).rejects.toThrow(/username/);
  });

  it("04 reports FAILED when the columns exist but the migration records are missing", async () => {
    const db = await untrackedProductionDb();
    await db.exec(script("02_baseline_untracked_only.sql"));
    await db.exec(migrationSql(USERNAME)); // schema changed by hand, nothing recorded for Prisma
    const { rows, last } = await verdict(db, "04_verify_read_only.sql");
    expect(last).toMatchObject({ item: "VERDICT", status: "FAILED" });
    expect(rows.find((r) => r.item === `migration record: ${USERNAME}`)?.status).toBe("FAIL");
  });
});
