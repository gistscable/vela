-- STEP 4 — READ ONLY. Every row should say PASS; the last row is the verdict.
WITH hist AS (
  SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"
),
expected(name, checksum) AS (VALUES
  ('20261015000000_init_postgresql', '7f6f8284567428390378100d6e07e4e635b5cda84448bc7167d560fea0972704'),
  ('20261015010000_transaction_approvals', '511907a9d45508b756d7153117a710560adfa5c945f97c182224bb282caefb68'),
  ('20261015020000_external_account_verification', '5938dc7834d02c34133102ddaa1b1eb248525fa6e95de9632e7aa0dafa8fd915'),
  ('20261015030000_enrollment_approval', 'c63fdbcf5783e2f1fe7c6609d70ccf58a3ad348e5be2dc405e18f30475bfd5c8'),
  ('20261015040000_totp_mfa', 'e269a73c444db195e5ff8da52007057a4a7dd7c7b9aae247f75810a53c73b27b'),
  ('20261015015000_ensure_external_account_table', 'a771fb1b45b55a1e9b33535e951250214af4ae559db2a96b081a83e2127400a4'),
  ('20261016000000_username_login', '18f4b2cfb417d0c2e367106571eeee56d9ae7aba1309fcd79efc47e3b82170c8')
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
