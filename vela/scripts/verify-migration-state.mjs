#!/usr/bin/env node
/**
 * Read-only PostgreSQL migration inspector for the Username / User ID release.
 *
 *   DATABASE_URL=... node scripts/verify-migration-state.mjs pre    # before migrating
 *   DATABASE_URL=... node scripts/verify-migration-state.mjs post   # after migrating
 *
 * Use the DIRECT (port 5432) connection string. The URL is read from the environment and is never
 * printed: only host, database name and server version are shown, so you can tell databases apart.
 * Every statement runs inside a READ ONLY transaction.
 *
 * Exit code: 0 = all checks passed, 1 = at least one check failed, 2 = could not run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const mode = process.argv[2];
if (!["pre", "post"].includes(mode) || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=<direct postgres url> node scripts/verify-migration-state.mjs <pre|post>");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USERNAME = "20261016000000_username_login";
const GUARD = "20261015015000_ensure_external_account_table";
const EXISTING = [
  "20261015000000_init_postgresql",
  "20261015010000_transaction_approvals",
  "20261015020000_external_account_verification",
  "20261015030000_enrollment_approval",
  "20261015040000_totp_mfa",
];
/** What each already-released migration leaves behind, so an untracked database can be baselined honestly. */
const SIGNATURES = {
  "20261015000000_init_postgresql": { tables: ["User", "Account", "Transaction", "Card", "Payee", "BillPayee", "BillPayment", "LinkedBank", "FundingIntent", "MoneyRequest", "ProcessorEvent"] },
  "20261015010000_transaction_approvals": { columns: { User: ["role"], Transaction: ["paymentMethod", "reviewedById", "reviewedAt"] } },
  "20261015020000_external_account_verification": { columns: { ExternalAccount: ["status", "microdepositAmount1", "microdepositAmount2", "microdepositExpiresAt", "microdepositAttempts", "reviewedById", "reviewedAt", "verifiedAt"] } },
  "20261015030000_enrollment_approval": { columns: { User: ["enrollmentStatus", "enrollmentReviewedById", "enrollmentReviewedAt"] } },
  "20261015040000_totp_mfa": { columns: { User: ["mfaEnabled", "totpSecretEncrypted", "totpLastUsedStep", "mfaPendingSecretEncrypted", "mfaPendingExpiresAt", "mfaFailedAttempts", "mfaLockedUntil"] } },
};

let failures = 0;
const ok = (label, detail = "") => console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
const bad = (label, detail = "") => { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); };
const info = (label, detail = "") => console.log(`  INFO  ${label}${detail ? ` — ${detail}` : ""}`);
const check = (cond, label, detail) => (cond ? ok(label, detail) : bad(label, detail));

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(url.hostname) ? undefined : { rejectUnauthorized: false } });
const q = async (sql, params) => (await client.query(sql, params)).rows;

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
} catch (error) {
  console.error(`Could not connect: ${error.code ?? ""} ${error.message}`.trim());
  process.exit(2);
}

try {
  console.log(`\n== Database identity (${mode}) ==`);
  const [{ version }] = await q("SELECT version()");
  const [{ db }] = await q("SELECT current_database() AS db");
  info("host", url.hostname);
  info("port", url.port || "5432");
  info("database", db);
  info("server", version.split(",")[0]);
  if (url.port === "6543" || /pgbouncer=true/i.test(url.search)) bad("connection is the pooled (transaction-mode) one", "use the direct/session connection on port 5432 for migrations");

  console.log("\n== Migration tracking ==");
  const [{ exists: hasHistory }] = await q(`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`);
  let history = [];
  if (hasHistory) {
    history = await q(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at, migration_name`);
    info("_prisma_migrations", `${history.length} record(s)`);
    for (const h of history) info(h.migration_name, h.rolled_back_at ? "ROLLED BACK" : h.finished_at ? "applied" : "FAILED / unfinished");
    const unfinished = history.filter((h) => !h.finished_at && !h.rolled_back_at);
    check(unfinished.length === 0, "no failed or unfinished migrations", unfinished.map((h) => h.migration_name).join(", "));
  } else {
    info("_prisma_migrations", "table does not exist: this database is NOT tracked by Prisma Migrate (e.g. created with db push)");
  }
  const applied = new Set(history.filter((h) => h.finished_at && !h.rolled_back_at).map((h) => h.migration_name));

  const cols = await q(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema='public'`);
  const tables = new Set(cols.map((c) => c.table_name));
  const hasCol = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);

  if (mode === "pre") {
    console.log("\n== Which released migrations are already reflected in the schema? ==");
    const present = [];
    for (const name of EXISTING) {
      const sig = SIGNATURES[name];
      const missing = [
        ...(sig.tables ?? []).filter((t) => !tables.has(t)).map((t) => `table ${t}`),
        ...Object.entries(sig.columns ?? {}).flatMap(([t, cs]) => cs.filter((c) => !hasCol(t, c)).map((c) => `${t}.${c}`)),
      ];
      if (missing.length === 0) present.push(name);
      info(name, missing.length === 0 ? "schema contains its changes" : `MISSING: ${missing.join(", ")}`);
    }
    check(!hasCol("User", "username") && !hasCol("User", "usernameNormalized"), "username columns are not there yet", "expected before migrating");
    check(!applied.has(USERNAME), "username migration is not recorded yet");

    console.log("\n== Recommended procedure ==");
    if (present.length !== EXISTING.length) {
      bad("schema is missing changes from already-released migrations", "stop: do not baseline; resolve this first (see docs/deploy-username-login.md)");
    } else if (hasHistory) {
      const unrecorded = EXISTING.filter((n) => !applied.has(n));
      if (unrecorded.length) bad("history table exists but is missing records for released migrations", unrecorded.join(", "));
      else ok("tracked database", "run: DATABASE_PROVIDER=postgresql node scripts/prisma.mjs migrate deploy   (applies only the two new migrations)");
    } else {
      ok("untracked database whose schema matches the five released migrations", "baseline them, then deploy:");
      for (const n of EXISTING) console.log(`          DATABASE_PROVIDER=postgresql node scripts/prisma.mjs migrate resolve --applied ${n}`);
      console.log("          DATABASE_PROVIDER=postgresql node scripts/prisma.mjs migrate deploy");
    }
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM "User"`);
    info("User rows (for your backup note)", String(n));
  }

  if (mode === "post") {
    console.log("\n== New columns ==");
    for (const c of ["username", "usernameNormalized"]) {
      const col = cols.find((x) => x.table_name === "User" && x.column_name === c);
      check(col && col.is_nullable === "YES", `User.${c} exists and is nullable`);
    }

    console.log("\n== Indexes and constraints ==");
    const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='User'`);
    const uniq = idx.find((i) => i.indexname === "User_usernameNormalized_key");
    check(uniq && /UNIQUE/i.test(uniq.indexdef) && /usernameNormalized/.test(uniq.indexdef), "unique index User_usernameNormalized_key");
    check(idx.some((i) => i.indexname === "User_email_key"), "email uniqueness still in place");
    const checks = await q(`SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='"User"'::regclass AND contype='c'`);
    const cc = checks.find((c) => c.conname === "User_username_consistent_check");
    check(cc && cc.convalidated, "CHECK User_username_consistent_check exists and is validated");
    check(cc && /lower/i.test(cc.def) && /@/.test(cc.def), "CHECK enforces lower-cased normalized value and no @");
    const ext = idx.length && (await q(`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='"ExternalAccount"'::regclass AND contype='f'`));
    check(ext && ext[0].n === 1, "ExternalAccount has exactly one foreign key (guard migration did not duplicate it)");

    console.log("\n== Migration records ==");
    check(!hasHistory ? false : applied.has(USERNAME), `${USERNAME} recorded as applied`);
    check(!hasHistory ? false : applied.has(GUARD), `${GUARD} recorded as applied`);
    for (const n of EXISTING) check(applied.has(n), `${n} recorded as applied`);

    console.log("\n== Data ==");
    if (!hasCol("User", "username") || !hasCol("User", "usernameNormalized")) {
      bad("cannot inspect username data", "the username columns do not exist");
    } else {
    const [stats] = await q(`SELECT count(*)::int AS users, count("username")::int AS with_username, count(*) FILTER (WHERE "username" IS DISTINCT FROM NULL AND "usernameNormalized" IS DISTINCT FROM lower("username"))::int AS inconsistent FROM "User"`);
    info("users", String(stats.users));
    info("users with a username", String(stats.with_username));
    check(stats.inconsistent === 0, "no inconsistent username/normalized pairs");
    }

    console.log("\n== Schema vs prisma/schema.postgresql.prisma ==");
    const schema = readFileSync(path.join(root, "prisma/schema.postgresql.prisma"), "utf8");
    const SCALARS = new Set(["String", "Int", "Boolean", "DateTime", "Float", "BigInt", "Decimal", "Json"]);
    const models = {};
    let current = null;
    for (const line of schema.split("\n")) {
      const m = /^model (\w+) \{/.exec(line);
      if (m) { current = m[1]; models[current] = {}; continue; }
      if (line.startsWith("}")) { current = null; continue; }
      const f = /^\s+(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
      const t = line.trim();
      if (current && f && !t.startsWith("@@") && !t.startsWith("//") && SCALARS.has(f[2]) && f[3] !== "[]") models[current][f[1]] = f[3] === "?";
    }
    const problems = [];
    for (const [model, fields] of Object.entries(models)) {
      const have = cols.filter((c) => c.table_name === model);
      if (!have.length) { problems.push(`missing table ${model}`); continue; }
      for (const [c, nullable] of Object.entries(fields)) {
        const col = have.find((x) => x.column_name === c);
        if (!col) problems.push(`${model}.${c} missing`);
        else if ((col.is_nullable === "YES") !== nullable) problems.push(`${model}.${c} nullability differs`);
      }
      for (const col of have) if (!(col.column_name in fields)) problems.push(`${model}.${col.column_name} not in Prisma schema`);
    }
    check(problems.length === 0, "all tables/columns/nullability match the Prisma schema", problems.join("; "));
  }
} catch (error) {
  console.error(`\nInspection failed: ${error.message}`);
  process.exitCode = 2;
  failures = failures || 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}

console.log(failures ? `\nRESULT: ${failures} check(s) FAILED` : "\nRESULT: all checks passed");
if (process.exitCode !== 2) process.exitCode = failures ? 1 : 0;
