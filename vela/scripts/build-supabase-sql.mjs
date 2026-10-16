#!/usr/bin/env node
/**
 * Generates docs/supabase/*.sql (the scripts to paste into the Supabase SQL editor) from the real
 * migration files, so the SQL and the Prisma checksums can never drift from prisma/migrations.
 *   node scripts/build-supabase-sql.mjs          # (re)write the files
 *   node scripts/build-supabase-sql.mjs --check  # exit 1 if they are out of date
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/supabase");

export const EXISTING = [
  "20261015000000_init_postgresql",
  "20261015010000_transaction_approvals",
  "20261015020000_external_account_verification",
  "20261015030000_enrollment_approval",
  "20261015040000_totp_mfa",
];
export const GUARD = "20261015015000_ensure_external_account_table";
export const USERNAME = "20261016000000_username_login";

const read = (name) => readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
export const checksums = Object.fromEntries([...EXISTING, GUARD, USERNAME].map((n) => [n, sha(read(n))]));

const list = (names) => names.map((n) => `'${n}'`).join(", ");
const record = (name, steps) => `INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '${checksums[name]}', clock_timestamp(), '${name}', NULL, NULL, clock_timestamp(), ${steps});`;

const files = {};

/* ---------- 01: read-only checks ---------- */
files["01a_readonly_state_check.sql"] = `-- STEP 1a — READ ONLY. Safe to run: it only SELECTs from the catalog and counts "User" rows.
-- Paste the whole result grid back (it contains no secrets). Expected on the current production database:
--   tracking = TRACKED or UNTRACKED; the 5 released migrations = OK; username columns = NOT PRESENT;
--   name clashes = NONE; verdict = READY.
WITH req(mig, tbl, col) AS (VALUES
  ('20261015000000_init_postgresql','User',NULL),('20261015000000_init_postgresql','Account',NULL),
  ('20261015000000_init_postgresql','Transaction',NULL),('20261015000000_init_postgresql','Card',NULL),
  ('20261015000000_init_postgresql','Payee',NULL),('20261015000000_init_postgresql','BillPayee',NULL),
  ('20261015000000_init_postgresql','BillPayment',NULL),('20261015000000_init_postgresql','LinkedBank',NULL),
  ('20261015000000_init_postgresql','FundingIntent',NULL),('20261015000000_init_postgresql','MoneyRequest',NULL),
  ('20261015000000_init_postgresql','ProcessorEvent',NULL),
  ('20261015010000_transaction_approvals','User','role'),
  ('20261015010000_transaction_approvals','Transaction','paymentMethod'),
  ('20261015010000_transaction_approvals','Transaction','reviewedById'),
  ('20261015010000_transaction_approvals','Transaction','reviewedAt'),
  ('20261015020000_external_account_verification','ExternalAccount','status'),
  ('20261015020000_external_account_verification','ExternalAccount','microdepositAmount1'),
  ('20261015020000_external_account_verification','ExternalAccount','microdepositAmount2'),
  ('20261015020000_external_account_verification','ExternalAccount','microdepositExpiresAt'),
  ('20261015020000_external_account_verification','ExternalAccount','microdepositAttempts'),
  ('20261015020000_external_account_verification','ExternalAccount','reviewedById'),
  ('20261015020000_external_account_verification','ExternalAccount','reviewedAt'),
  ('20261015020000_external_account_verification','ExternalAccount','verifiedAt'),
  ('20261015030000_enrollment_approval','User','enrollmentStatus'),
  ('20261015030000_enrollment_approval','User','enrollmentReviewedById'),
  ('20261015030000_enrollment_approval','User','enrollmentReviewedAt'),
  ('20261015040000_totp_mfa','User','mfaEnabled'),
  ('20261015040000_totp_mfa','User','totpSecretEncrypted'),
  ('20261015040000_totp_mfa','User','totpLastUsedStep'),
  ('20261015040000_totp_mfa','User','mfaPendingSecretEncrypted'),
  ('20261015040000_totp_mfa','User','mfaPendingExpiresAt'),
  ('20261015040000_totp_mfa','User','mfaFailedAttempts'),
  ('20261015040000_totp_mfa','User','mfaLockedUntil')
),
checked AS (
  SELECT r.mig, r.tbl, r.col,
    CASE WHEN r.col IS NULL
      THEN EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_name=r.tbl)
      ELSE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=r.tbl AND c.column_name=r.col)
    END AS present
  FROM req r
),
per_mig AS (
  SELECT mig, count(*) FILTER (WHERE NOT present) AS missing,
         string_agg(CASE WHEN NOT present THEN tbl || COALESCE('.' || col, '') END, ', ') AS what
  FROM checked GROUP BY mig
),
rows_(ord, item, status, detail) AS (
  SELECT 1, 'database', 'info', current_database()
  UNION ALL SELECT 2, 'server', 'info', split_part(version(), ',', 1)
  UNION ALL SELECT 3, 'connected as', 'info', current_user::text
  UNION ALL SELECT 4, 'User rows', 'info', (SELECT count(*) FROM "User")::text
  UNION ALL SELECT 5, 'tracking (_prisma_migrations table)',
    CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'UNTRACKED' ELSE 'TRACKED' END,
    CASE WHEN to_regclass('public._prisma_migrations') IS NULL
      THEN 'no Prisma history table: use script 02 (baseline) before 03'
      ELSE 'history table exists: run 01b next, then script 03' END
  UNION ALL SELECT 10 + row_number() OVER (ORDER BY mig), 'schema contains ' || mig,
    CASE WHEN missing = 0 THEN 'OK' ELSE 'STOP' END, COALESCE('missing: ' || what, '')
  FROM per_mig
  UNION ALL SELECT 30, 'username columns on "User"',
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name IN ('username','usernameNormalized')) = 0
      THEN 'NOT PRESENT' ELSE 'STOP' END,
    'expected NOT PRESENT before migrating'
  UNION ALL SELECT 31, 'name clashes (index / check constraint)',
    CASE WHEN (SELECT count(*) FROM pg_class WHERE relname = 'User_usernameNormalized_key')
            + (SELECT count(*) FROM pg_constraint WHERE conname = 'User_username_consistent_check') = 0
      THEN 'NONE' ELSE 'STOP' END, ''
  UNION ALL SELECT 32, 'User.email unique index',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='User' AND indexdef ILIKE 'CREATE UNIQUE%(email)%')
      THEN 'OK' ELSE 'WARN' END, 'email sign-in relies on it'
  UNION ALL SELECT 33, 'ExternalAccount foreign keys (userId -> User)',
    'info', (SELECT count(*) FROM pg_constraint WHERE conrelid = to_regclass('public."ExternalAccount"') AND contype = 'f')::text
  UNION ALL SELECT 34, 'ExternalAccount indexes',
    'info', COALESCE((SELECT string_agg(indexname, ', ' ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='ExternalAccount'), 'none')
  UNION ALL SELECT 99, 'VERDICT',
    CASE WHEN (SELECT count(*) FROM per_mig WHERE missing > 0) = 0
          AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name IN ('username','usernameNormalized')) = 0
          AND (SELECT count(*) FROM pg_class WHERE relname = 'User_usernameNormalized_key')
            + (SELECT count(*) FROM pg_constraint WHERE conname = 'User_username_consistent_check') = 0
      THEN 'READY' ELSE 'STOP' END,
    'READY = safe to continue; STOP = do not change anything, send me this output'
)
SELECT item, status, detail FROM rows_ ORDER BY ord;
`;

files["01b_readonly_migration_history.sql"] = `-- STEP 1b — READ ONLY. Run ONLY if script 01a said tracking = TRACKED
-- (if the table does not exist this fails with: relation "_prisma_migrations" does not exist — which also means UNTRACKED).
-- Expected: the five released migrations, each with finished_at set and rolled_back_at empty.
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count,
       CASE WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'FAILED / UNFINISHED — STOP'
            WHEN rolled_back_at IS NOT NULL THEN 'rolled back'
            ELSE 'applied' END AS state
FROM "_prisma_migrations"
ORDER BY started_at, migration_name;
`;

/* ---------- 02: baseline (untracked databases only) ---------- */
files["02_baseline_untracked_only.sql"] = `-- STEP 3a — WRITES. Run ONLY if script 01a said tracking = UNTRACKED and every
-- "schema contains …" row was OK. It creates Prisma's history table (identical to the one Prisma creates) and records
-- the five already-released migrations as applied, exactly as \`prisma migrate resolve --applied\` does.
-- It changes no application table. If the table already exists, CREATE TABLE fails and nothing is changed.
BEGIN;

CREATE TABLE "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);

${EXISTING.map((n) => record(n, 0)).join("\n\n")}

COMMIT;
`;

/* ---------- 03: apply ---------- */
const guardSql = read(GUARD).toString("utf8").trimEnd();
const usernameSql = read(USERNAME).toString("utf8").trimEnd();
files["03_apply_username_migrations.sql"] = `-- STEP 3b — WRITES. Applies the two new migrations and records them for Prisma, in ONE transaction:
-- any error rolls everything back. Prerequisite: a recoverable backup, and (if the database was untracked) script 02.
-- The SQL between the "BEGIN MIGRATION" / "END MIGRATION" markers is byte-for-byte prisma/migrations/<name>/migration.sql;
-- the checksums are the SHA-256 of those files, which is what Prisma stores.
BEGIN;

-- Preconditions: stop (and roll back) rather than half-apply.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'No _prisma_migrations table: this database is untracked. Run 02_baseline_untracked_only.sql first.';
  END IF;
  IF (SELECT count(*) FROM "_prisma_migrations"
       WHERE migration_name IN (${list(EXISTING)})
         AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 5 THEN
    RAISE EXCEPTION 'The five released migrations are not all recorded as applied. Do not continue; send the output of 01a/01b.';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name IN ('${GUARD}', '${USERNAME}')) THEN
    RAISE EXCEPTION 'One of the new migrations is already recorded. Nothing to do; run 04_verify.sql instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'A failed/unfinished migration is recorded. Do not continue.';
  END IF;
END
$$;

-- ===== BEGIN MIGRATION ${GUARD} =====
${guardSql}
-- ===== END MIGRATION ${GUARD} =====

${record(GUARD, 1)}

-- ===== BEGIN MIGRATION ${USERNAME} =====
${usernameSql}
-- ===== END MIGRATION ${USERNAME} =====

${record(USERNAME, 1)}

COMMIT;
`;

/* ---------- 04: verify ---------- */
files["04_verify_read_only.sql"] = `-- STEP 4 — READ ONLY. Every row should say PASS; the last row is the verdict.
WITH hist AS (
  SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"
),
expected(name, checksum) AS (VALUES
${[...EXISTING, GUARD, USERNAME].map((n) => `  ('${n}', '${checksums[n]}')`).join(",\n")}
),
rows_(ord, item, status, detail) AS (
  SELECT 1, 'User.username is a nullable text column',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='username' AND data_type='text' AND is_nullable='YES') THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 2, 'User.usernameNormalized is a nullable text column',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='usernameNormalized' AND data_type='text' AND is_nullable='YES') THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 3, 'unique index User_usernameNormalized_key',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='User' AND indexname='User_usernameNormalized_key' AND indexdef ILIKE 'CREATE UNIQUE INDEX%("usernameNormalized")%') THEN 'PASS' ELSE 'FAIL' END,
    COALESCE((SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='User_usernameNormalized_key'), 'missing')
  UNION ALL SELECT 4, 'CHECK User_username_consistent_check exists and is validated',
    CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='User_username_consistent_check' AND conrelid='"User"'::regclass AND contype='c' AND convalidated) THEN 'PASS' ELSE 'FAIL' END,
    COALESCE((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='User_username_consistent_check' AND conrelid='"User"'::regclass), 'missing')
  UNION ALL SELECT 5, 'User.email unique index still present',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='User' AND indexdef ILIKE 'CREATE UNIQUE%(email)%') THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 6, 'ExternalAccount has exactly one foreign key',
    CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public."ExternalAccount"') AND contype='f') = 1 THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 7, 'ExternalAccount_userId_createdAt_idx exists',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='ExternalAccount_userId_createdAt_idx') THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 10 + row_number() OVER (ORDER BY e.name), 'migration record: ' || e.name,
    CASE WHEN EXISTS (SELECT 1 FROM hist h WHERE h.migration_name=e.name AND h.finished_at IS NOT NULL AND h.rolled_back_at IS NULL AND h.checksum=e.checksum) THEN 'PASS' ELSE 'FAIL' END,
    'finished, not rolled back, checksum matches the file in this PR'
  FROM expected e
  UNION ALL SELECT 30, 'no failed / unfinished migration records',
    CASE WHEN NOT EXISTS (SELECT 1 FROM hist WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN 'PASS' ELSE 'FAIL' END, ''
  UNION ALL SELECT 31, 'username data is consistent',
    CASE WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE ("username" IS NULL) <> ("usernameNormalized" IS NULL) OR "usernameNormalized" IS DISTINCT FROM lower("username")) THEN 'PASS' ELSE 'FAIL' END,
    (SELECT count(*) FROM "User")::text || ' users, ' || (SELECT count("username") FROM "User")::text || ' with a username (0 expected right after migrating)'
)
SELECT item, status, detail FROM (
  SELECT ord, item, status, detail FROM rows_
  UNION ALL SELECT 999, 'VERDICT', CASE WHEN (SELECT count(*) FROM rows_ WHERE status <> 'PASS') = 0 THEN 'ALL PASS' ELSE 'FAILED' END, ''
) x ORDER BY ord;
`;

export function build() {
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = false;
  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(outDir, name);
    if (check) {
      if (!existsSync(file) || readFileSync(file, "utf8") !== body) { console.error(`out of date: docs/supabase/${name}`); stale = true; }
    } else writeFileSync(file, body);
  }
  if (check && stale) process.exit(1);
  console.log(check ? "docs/supabase/*.sql are up to date" : `wrote ${Object.keys(files).length} files to docs/supabase/`);
}
