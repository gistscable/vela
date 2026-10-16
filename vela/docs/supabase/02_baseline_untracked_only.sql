-- STEP 3a — WRITES. Run ONLY if script 01a said tracking = UNTRACKED and every
-- "schema contains …" row was OK. It creates Prisma's history table (identical to the one Prisma creates) and records
-- the five already-released migrations as applied, exactly as `prisma migrate resolve --applied` does.
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

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '7f6f8284567428390378100d6e07e4e635b5cda84448bc7167d560fea0972704', clock_timestamp(), '20261015000000_init_postgresql', NULL, NULL, clock_timestamp(), 0);

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '511907a9d45508b756d7153117a710560adfa5c945f97c182224bb282caefb68', clock_timestamp(), '20261015010000_transaction_approvals', NULL, NULL, clock_timestamp(), 0);

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, '5938dc7834d02c34133102ddaa1b1eb248525fa6e95de9632e7aa0dafa8fd915', clock_timestamp(), '20261015020000_external_account_verification', NULL, NULL, clock_timestamp(), 0);

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'c63fdbcf5783e2f1fe7c6609d70ccf58a3ad348e5be2dc405e18f30475bfd5c8', clock_timestamp(), '20261015030000_enrollment_approval', NULL, NULL, clock_timestamp(), 0);

INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'e269a73c444db195e5ff8da52007057a4a7dd7c7b9aae247f75810a53c73b27b', clock_timestamp(), '20261015040000_totp_mfa', NULL, NULL, clock_timestamp(), 0);

COMMIT;
