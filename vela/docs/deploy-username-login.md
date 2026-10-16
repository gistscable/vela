# Deploying Username / User ID login (migration `20261016000000_username_login`)

**Order matters: apply the database migration first, then deploy the application.**

The new release reads `User.username` / `User.usernameNormalized`. Prisma selects every column of the
model on every `User` query, so a release deployed *before* the migration fails on sign-in, MFA, and
every authenticated page until the columns exist. The previous release, by contrast, ignores the new
columns, so applying the migration early is safe. (`tests/postgres-migrations.test.ts` checks both
directions.)

Netlify builds from `main`, so merging the PR deploys production. Apply the migration **before merging**.

## What the migration does

| Migration | Effect | Existing data |
|---|---|---|
| `20261015015000_ensure_external_account_table` | `CREATE TABLE/INDEX IF NOT EXISTS "ExternalAccount"` (+ FK guarded). Repairs *fresh* databases only: the init migration never created this table, so replaying history failed at `20261015020000`. | No-op where the table exists. |
| `20261016000000_username_login` | Adds nullable `User.username` and `User.usernameNormalized`, a unique index on `usernameNormalized`, and a CHECK that keeps the pair consistent (`usernameNormalized = lower(username)`, no `@`, both set or both null). | Rows are not modified. Nobody gets a generated username; users keep email sign-in and choose a username in Settings. |

Neither migration edits a previously applied migration. The guard migration's timestamp sorts before
migrations already applied in an existing database; `prisma migrate deploy` applies unapplied migrations
regardless, and the guard does nothing there.

## Steps

1. **Back up** the Supabase database (or confirm point-in-time recovery is on).
2. Use the **direct / session-mode** connection (port 5432), not the transaction pooler, as `DIRECT_URL`.
3. Check how the database is tracked:
   ```bash
   DATABASE_PROVIDER=postgresql DATABASE_URL=... DIRECT_URL=... npm run prisma:generate
   DATABASE_PROVIDER=postgresql DATABASE_URL=... DIRECT_URL=... node scripts/prisma.mjs migrate status
   ```
   - **Tracked by Prisma migrations** (`_prisma_migrations` exists and lists the earlier five): continue to step 4a.
   - **Created some other way** (e.g. `db push`; `migrate status` reports P3005 / no history): continue to step 4b.
4. Apply:
   - **4a.** `DATABASE_PROVIDER=postgresql ... npm run db:migrate:deploy`
   - **4b.** Run the SQL of `20261015015000_ensure_external_account_table/migration.sql` and then
     `20261016000000_username_login/migration.sql` in the Supabase SQL editor (in that order, each as a
     single run), then record them so future `migrate deploy` runs don't retry:
     ```bash
     node scripts/prisma.mjs migrate resolve --applied 20261015015000_ensure_external_account_table
     node scripts/prisma.mjs migrate resolve --applied 20261016000000_username_login
     ```
     (Only mark the earlier migrations as applied if the database really contains their changes.)
5. **Verify the schema** before deploying:
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name = 'User' AND column_name IN ('username','usernameNormalized');   -- 2 rows, both YES
   SELECT indexname FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_usernameNormalized_key';
   SELECT count(*) AS users, count("username") AS with_username FROM "User";            -- with_username = 0
   ```
   Confirm that signing in on the **currently deployed** (old) site still works.
6. **Merge the PR** / let Netlify deploy. Smoke test: sign in with an existing email, confirm the dashboard
   shows the "Choose a Username / User ID" prompt, set one in Settings, sign out, sign in with it
   (any letter case), and open the MFA screen to check the masked phone/email.

## Rollback

Prefer rolling the **application** back (Netlify → previous deploy). The old release ignores the new
columns, so the migration can stay. To remove the columns as well (this deletes chosen usernames),
run `prisma/rollback/20261016000000_username_login.down.sql`, then
`prisma migrate resolve --rolled-back 20261016000000_username_login`.

## What has and has not been verified

Verified in CI-less local tests: the whole history replays on PostgreSQL (PGlite) and matches
`schema.postgresql.prisma` exactly; the two migrations apply to a database that already holds users
without changing any row; the previous release's queries still work afterwards; the rollback works.
**Not verified:** the real production Supabase database, which is not reachable from the build
environment. Steps 3–5 above are how to confirm it there.
