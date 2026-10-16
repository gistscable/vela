-- STEP 3b — WRITES. Applies the two new migrations and records them for Prisma, in ONE transaction:
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
       WHERE migration_name IN ('20261015000000_init_postgresql', '20261015010000_transaction_approvals', '20261015020000_external_account_verification', '20261015030000_enrollment_approval', '20261015040000_totp_mfa')
         AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 5 THEN
    RAISE EXCEPTION 'The five released migrations are not all recorded as applied. Do not continue; send the output of 01a/01b.';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name IN ('20261015015000_ensure_external_account_table', '20261016000000_username_login')) THEN
    RAISE EXCEPTION 'One of the new migrations is already recorded. Nothing to do; run 04_verify.sql instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'A failed/unfinished migration is recorded. Do not continue.';
  END IF;
END
$$;

-- ===== BEGIN MIGRATION 20261015015000_ensure_external_account_table =====
-- Repair for fresh databases. This does NOT modify any previously applied migration.
--
-- The init migration never created "ExternalAccount", yet 20261015020000_external_account_verification
-- ALTERs it, so replaying the history on a brand-new database failed there. Databases that were
-- created from the Prisma schema (e.g. `db push`) already have this table.
--
-- Plain statements only (no DO/PL-pgSQL block) so every migration runner executes it identically.
-- Everything here is IF NOT EXISTS: on a database that already has the table it changes nothing;
-- on a fresh database it creates the pre-20261015020000 shape that the next migration extends.
-- Its timestamp sorts between the two migrations it sits between, so replays run it in order, and
-- `prisma migrate deploy` applies it as a harmless no-op to databases that are already past that point.
CREATE TABLE IF NOT EXISTS "ExternalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountMask" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ExternalAccount_userId_createdAt_idx" ON "ExternalAccount"("userId", "createdAt");
-- ===== END MIGRATION 20261015015000_ensure_external_account_table =====

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'a771fb1b45b55a1e9b33535e951250214af4ae559db2a96b081a83e2127400a4', clock_timestamp(), '20261015015000_ensure_external_account_table', NULL, NULL, clock_timestamp(), 1);

-- ===== BEGIN MIGRATION 20261016000000_username_login =====
-- Username / User ID: a separate, unique login identifier (not the internal "id").
--
-- Existing users are NOT given a generated username and keep signing in with their email.
-- They choose a username themselves in Settings; until then both columns stay NULL.
-- PostgreSQL treats NULLs as distinct in a unique index, so any number of users may still be
-- without a username while chosen usernames remain unique.
--
-- "username" keeps the spelling the user typed (for display); "usernameNormalized" is the
-- lower-cased value that carries the unique index, so "Sam.Lee" and "sam.lee" collide.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;

CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- Defence in depth: the database itself refuses a normalized value that is not the lower-cased
-- username, an "@" (reserved to tell emails from usernames at sign-in), or a username set
-- without its normalized twin.
ALTER TABLE "User" ADD CONSTRAINT "User_username_consistent_check" CHECK (
  ("username" IS NULL AND "usernameNormalized" IS NULL)
  OR (
    "username" IS NOT NULL
    AND "usernameNormalized" IS NOT NULL
    AND "usernameNormalized" = lower("username")
    AND position('@' IN "username") = 0
  )
);
-- ===== END MIGRATION 20261016000000_username_login =====

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '18f4b2cfb417d0c2e367106571eeee56d9ae7aba1309fcd79efc47e3b82170c8', clock_timestamp(), '20261016000000_username_login', NULL, NULL, clock_timestamp(), 1);

COMMIT;
