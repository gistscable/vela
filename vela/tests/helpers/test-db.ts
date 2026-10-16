import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { vi } from "vitest";

const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "../..");

/**
 * Create an empty, disposable SQLite database with the app's schema and point `DATABASE_URL`
 * at it. The schema is copied from the checked-in prisma/dev.db (tables only, no rows), which
 * is itself kept in step with prisma/schema.prisma.
 *
 * Call before importing anything that imports `@/lib/db` (use dynamic imports after
 * `vi.resetModules()`), because that module opens the database when it is first loaded.
 */
export function useDisposableDatabase() {
  const name = `unit-${process.pid}-${randomBytes(4).toString("hex")}.db`;
  const file = path.join(root, "prisma", name);
  const { DatabaseSync } = require("node:sqlite");
  const source = new DatabaseSync(path.join(root, "prisma", "dev.db"), { readOnly: true });
  const target = new DatabaseSync(file);
  const statements = source
    .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'index', rowid")
    .all() as { sql: string }[];
  for (const { sql } of statements) target.exec(sql);
  source.close();

  process.env.DATABASE_URL = `file:./${name}`;
  process.env.DATABASE_PROVIDER = "sqlite";
  vi.resetModules();

  return {
    file,
    /** Raw handle for assertions that must bypass the app's data layer. */
    raw: target as { prepare: (sql: string) => { all: (...a: unknown[]) => any[]; get: (...a: unknown[]) => any; run: (...a: unknown[]) => any }; exec: (sql: string) => void; close: () => void },
    cleanup() {
      try { target.close(); } catch { /* already closed */ }
      for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) rmSync(f, { force: true });
    },
  };
}
