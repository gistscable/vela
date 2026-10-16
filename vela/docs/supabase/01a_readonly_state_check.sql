-- STEP 1a — READ ONLY. Safe to run: it only SELECTs from the catalog and counts "User" rows.
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
